import { DefaultEventsMap, Server, Socket } from "socket.io";
import { readdirSync } from "fs";
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
    console.log(`${ansi["faint"]}[${new Date().toLocaleString()}]${ansi["null"]} ${msg_head_color_escape}${msg_head}${ansi["null"]}: ${msg_color_escape}${msg}${ansi["null"]} ${ansi["faint"]}${tail}${ansi["null"]}`)
}

const defaultColours = ["red", "orange", "yellow", "lime", "green", "cyan", "blue", "purple", "pink", "gray", "brown"]

async function getVideoList() {
    const files = readdirSync(path.join(process.cwd(), "public", "videos"), {withFileTypes: true, recursive: true})
    const filenames: string[] = []

    for (const file of files) {
        const filename = path.join(file.parentPath.slice(file.parentPath.indexOf("videos")), file.name)
        if (file.isFile() && (filename.endsWith(".mp4") || filename.endsWith(".ogg"))) {
            filenames.push(filename)
        }
    }

    return filenames
}

interface userData {
    user: string,
    color: string
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
        // userData is a dictionary linking client sockets to usernames and colours, for easy reference.
        const clientData: {[id: string]: userData} = {}

        io.on('connection', (socket) => {
            tLog('connected', `socket=${socket.id}.`);
            const clientID: string = socket.id

            // Custom heartbeat function (probably wasn't supposed to make this)
            socket.on('heartbeat', (msg, msgTime) => {
                socket.emit('heartbeat', msg, msgTime)
                // tLog('heartbeat', `time=${new Date(msgTime).toLocaleTimeString()}`, `(socket=${socket.id})`)
            })

            socket.on('clientInfo', (newUser, newPass, newColor, failed, passthroughFailMessage) => {
                tLog('clientInfo', `user=${newUser}, pass=${newPass}, color=${newColor}` + (failed ? ` passthroughFailMessage=${passthroughFailMessage}` : ''))

                // Map colors: if left blank, a random color is generated
                if (!newColor.length) {
                    newColor = defaultColours[Math.floor(Math.random() * defaultColours.length)];
                }

                // Check if username is already in use
                if (newUser.length) {
                    for (const id in clientData) {
                        if (clientData[id].user == newUser) {
                            failed = true
                            passthroughFailMessage = "Username already in use."
                        }
                    }
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
                } else if (newUser.length > 200) {
                    failMessage = "Username too long (>200 characters)"
                } else {success = true}

                if (success) {
                    // Log client in
                    socket.emit('clientAuthorised', newColor)
                    loggedInClients.push(socket)

                    // blockedUsernames.push(newUser)
                    clientData[clientID] = {user: newUser, color: newColor}

                    for (const client of loggedInClients) { // Optimise this once disconnection detection implemented
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
                        socket.on('chatMessage', (msg) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            const user = clientData[clientID].user
                            const color = clientData[clientID].color

                            tLog('chatMessage', `${user}: ${msg}`, `(socket=${socket.id})`, ansi["bold"], ansi["magenta"])
                            for (const client of loggedInClients) {
                                client.emit('chatControl', user, color, msg)
                            }
                        });

                        // Relay video states
                        socket.on('videoState', (paused, pos, path, silent) => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            const user = clientData[clientID].user
                            const color = clientData[clientID].color

                            tLog('videoState', `user=${user}, paused=${paused}, position=${pos}, path=${path}, silent=${silent}`, `(socket=${socket.id})`)
                            for (const client of loggedInClients) {
                                if (client != socket) {
                                    client.emit('videoControl', paused, pos, path, user, color, silent)
                                }
                            }
                        });

                        // Relay state requests
                        socket.on('stateRequest', () => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            const user = clientData[clientID].user

                            tLog('stateRequest', `user=${user}`, `(socket=${socket.id})`)
                            for (const client of loggedInClients) {
                                if (client != socket) {
                                    client.emit('requestState')
                                }
                            }
                        })

                        // Respond with video list
                        socket.on('videoListRequest', () => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            const user = clientData[clientID].user

                            tLog('videoListRequest', `user=${user}`, `(socket=${socket.id})`)
                            getVideoList().then((videoList: string[]) => {
                                socket.emit('videoList', videoList)
                            })
                        })

                        socket.on('clientListRequest', () => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            const user = clientData[clientID].user

                            tLog('clientListRequest', `user=${user}`, `(socket=${socket.id})`)
                            socket.emit('clientList', clientData)
                        })

                        // Log out user (note that user is still in authorisedClients)
                        socket.on('logOut', () => {
                            if (loggedInClients.indexOf(socket) == -1) {return}
                            const user = clientData[clientID].user
                            const color = clientData[clientID].color
                            
                            tLog('logOut', `user=${user}`, `(socket=${socket.id})`)
                            for (const client of loggedInClients) {
                                client.emit('userLeft', user, color)
                            }

                            const clientIndex = loggedInClients.indexOf(socket)
                            if (clientIndex != -1) {loggedInClients.splice(clientIndex, 1)}
                            clientData[clientID] = {user: "", color: ""} // I hate this
                            // const usernameIndex = blockedUsernames.indexOf(user)
                            // if (usernameIndex != -1) {blockedUsernames.splice(usernameIndex, 1)}

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
