import { DefaultEventsMap, Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";

// ansi and tLog can be moved to separate files, or replaced with a library. I will not do this.

const ansi = Object({
    "null": "\u001b[0m",
    "bold": "\u001b[1m",
    "faint": "\u001b[2m",
    "italic": "\u001b[3m",
    "underline": "\u001b[4m",
    "black": "\u001b[30m",
    "red": "\u001b[31m",
    "green": "\u001b[32m",
    "yellow": "#\u001b[33m",
    "blue": "\u001b[34m",
    "magenta": "\u001b[35m",
    "cyan": "\u001b[36m",
    "white": "\u001b[37m",
})

function tLog(msg_head: string,  msg: string, tail: string = "", msg_head_color_escape: string = ansi["bold"], msg_color_escape: string = "") {
    console.log(`${ansi["faint"]}[${new Date().toLocaleTimeString()}]${ansi["null"]} ${msg_head_color_escape}${msg_head}${ansi["null"]}: ${msg_color_escape}${msg}${ansi["null"]} ${ansi["faint"]}${tail}${ansi["null"]}`)
}

const defaultColours = ["red", "orange", "yellow", "lime", "green", "cyan", "blue", "purple", "pink", "gray", "brown"]

async function getVideoList() {
    const videosDirectory = path.join(process.cwd(), "public", "videos");
    const filenames = fs.readdirSync(videosDirectory);
    return filenames
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function handler(_req: any, res: any) {
    if (!res.socket.server.io) {
        tLog('info', "Starting server...")

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
            tLog('connected', `socket=${socket.id}.`);

            // Simple heartbeat function
            socket.on('heartbeat', (msg) => {socket.emit('heartbeat', msg); tLog('heartbeat', `(socket=${socket.id})`)})

            socket.on('clientInfo', (newUser, newPass, newColor, failed, passthroughFailMessage) => {
                tLog('clientInfo', `user=${newUser}, pass=${newPass}, color=${newColor}`)

                // Map colors: if left blank, a random color is generated
                if (!newColor.length) {
                    newColor = defaultColours[Math.floor(Math.random() * defaultColours.length)];
                }

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
                } else if (newUser.length > 200) {
                    failMessage = "Username too long (>200 characters)"
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
                        tLog('clientAuthorised (sent)', `user=${newUser}`, `(socket=${socket.id}).`, ansi["underline"]);

                        // Relay chat messages
                        socket.on('chatMessage', (msg, user, color) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            tLog('chatMessage', `${user}: ${msg}`, `(socket=${socket.id})`, ansi["bold"], ansi["magenta"])
                            for (const client of loggedInClients) {
                                client.emit('chatControl', user, color, msg)
                            }
                        });

                        // Relay video states
                        socket.on('videoState', (paused, pos, path, silent, user, color) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            tLog('videoState', `user=${user}, paused=${paused}, position=${pos}, path=${path}, silent=${silent}`, `(socket=${socket.id})`)
                            for (const client of loggedInClients) {
                                if (client != socket) {
                                    client.emit('videoControl', paused, pos, path, user, color, silent)
                                }
                            }
                        });

                        // Relay state requests
                        socket.on('stateRequest', (user) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            tLog('stateRequest', `user=${user}`, `(socket=${socket.id})`)
                            for (const client of loggedInClients) {
                                if (client != socket) {
                                    client.emit('requestState')
                                }
                            }
                        })

                        // Respond with video list
                        socket.on('videoListRequest', (user) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}

                            tLog('videoListRequest', `user=${user}`, `(socket=${socket.id})`)
                            const videoListPromise = getVideoList()
                            videoListPromise.then((videoList) => {
                                videoList = videoList.filter(item => (!item.endsWith(".gitignore")))
                                socket.emit('videoList', videoList)
                            })
                        })

                        // Log out user (note that user is still in authorisedClients)
                        socket.on('logOut', (user, color) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            
                            tLog('logOut', `user=${user}`, `(socket=${socket.id})`)
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
                } else {
                    tLog('clientRejected (sent)', `user=${newUser}, message=\"${failMessage}\"`, `(socket=${socket.id}).`, ansi["underline"]);
                    socket.emit('clientRejected', failMessage)
                }
            })
        });
    }
    res.end()
}
