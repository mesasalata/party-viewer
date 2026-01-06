import { DefaultEventsMap, Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";

// const color_map = Object({
//     "red": "#ff0000",
//     "orange": "#ff9900",
//     "yellow": "#ffff00",
//     "lime": "#99ff00",
//     "green": "#00ff00",
//     "cyan": "#00ffff",
//     "blue": "#0000ff",
//     "purple": "#9900ff",
//     "pink": "#ff00ff",
//     "gray": "#aaaaaa",
//     "grey": "#aaaaaa",
//     "black": "#000000",
//     "white": "#ffffff",
//     "brown": "#994400"
// })

const defaultColours = ["red", "orange", "yellow", "lime", "green", "cyan", "blue", "purple", "pink", "gray", "brown"]

async function getVideoList() {
    const videosDirectory = path.join(process.cwd(), "public", "videos");
    const filenames = fs.readdirSync(videosDirectory);
    return filenames
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function handler(_req: never, res: any) {
    if (!res.socket.server.io) {
        console.log("> Starting server...")

        const io = new Server(res.socket.server);
        res.socket.server.io = io

        // authorisedClients is a list of all clients that have listeners already created
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authorisedClients: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[] = []
        // loggedInClients is a list of all clients where the listeners are active
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loggedInClients: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[] = []
        // blockedUsernames is a list of all usernames that are in use
        const blockedUsernames: string[] = []

        io.on('connection', (socket) => {
            console.log(`connected: socket=${socket.id}.`);

            // Simple heartbeat function
            socket.on('heartbeat', (msg) => {socket.emit('heartbeat', msg); console.log(`heartbeat: socket=${socket.id}`)})

            socket.on('clientInfo', (newUser, newPass, newColor, failed, passthroughFailMessage) => {
                console.log(`clientInfo: user=${newUser}, pass=${newPass}, color=${newColor}`)

                // Map colors: if left blank, a random color is generated
                if (!newColor.length) {
                    // color = Object.keys(color_map)[Math.floor(Math.random() * Object.keys(color_map).length)];
                    newColor = defaultColours[Math.floor(Math.random() * defaultColours.length)];
                }
                // used to check for !color.slice(1).split('').every((char) => {return "0123456789abcdef".indexOf(char) != -1}) || (color.length != 4 && color.length != 7 && color.length != 9)
                // if (Object.hasOwn(color_map, color)) {
                //     color = color_map[color]
                // }

                // Check for failure; if so, generate a message
                let failMessage = ""
                let success = false
                if (failed) {
                    failMessage = passthroughFailMessage // Workaround for page reload on not sending a packet in a function (pure jank)
                } else if (newPass != process.env.SERVER_PASS) {
                    failMessage = "Incorrect password."
                } else if (newUser.replace(/ /g, '').length == 0) {
                    failMessage = "Empty username."
                } else if (blockedUsernames.indexOf(newUser) != -1) {
                    failMessage = "Username already in use."
                } else {success = true}

                if (success) {
                    // Log client in
                    socket.emit('clientAuthorised', newColor)
                    loggedInClients.push(socket)
                    blockedUsernames.push(newUser)
                    for (const client of loggedInClients) {
                        if (client != socket) {
                            client.emit('requestState')
                        }
                        client.emit('userJoined', newUser, newColor)
                    }

                    // Authorise client and add listeners (workaround for if a client logs back in after logging out)
                    if (authorisedClients.indexOf(socket) == -1) {
                        authorisedClients.push(socket)
                        console.log(`authorised: user=${newUser}, color=${newColor}, socket=${socket.id}.`);

                        // Relay chat messages
                        socket.on('chatMessage', (msg, user, color) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            console.log(`chatMessage: ${user}: ${msg} (socket=${socket.id})`)
                            for (const client of loggedInClients) {
                                client.emit('chatControl', user, color, msg)
                            }
                        });

                        // Relay video states
                        socket.on('videoState', (paused, pos, path, silent, user, color) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            console.log(`videoState: user=${user}, paused=${paused}, position=${pos}, path=${path}, silent=${silent}`)
                            for (const client of loggedInClients) {
                                if (client != socket) {
                                    client.emit('videoControl', paused, pos, path, user, color, silent)
                                }
                            }
                        });

                        // Relay state requests
                        socket.on('stateRequest', (user) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            console.log(`stateRequest: user=${user}`)
                            for (const client of loggedInClients) {
                                if (client != socket) {
                                    client.emit('requestState')
                                }
                            }
                        })

                        // Respond with video list
                        socket.on('videoListRequest', (user) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            console.log(`videoListRequest: user=${user}`)
                            const videoListPromise = getVideoList()
                            videoListPromise.then((videoList) => socket.emit('videoList', videoList))
                        })

                        // Log out user (note that user is still in authorisedClients)
                        socket.on('logOut', (user, color) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            
                            for (const client of loggedInClients) {
                                client.emit('userLeft', user, color)
                            }

                            const clientIndex = loggedInClients.indexOf(socket)
                            if (clientIndex != -1) {loggedInClients.splice(clientIndex, 1)}
                            const usernameIndex = blockedUsernames.indexOf(user)
                            if (usernameIndex != -1) {blockedUsernames.splice(usernameIndex, 1)}

                            success = false
                        })
                    }
                } else {socket.emit('clientRejected', failMessage)}
            })
        });
    }
    res.end()
}
