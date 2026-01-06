import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export default function Home() {
  // Warning: Editing and saving this file breaks the site. Restart the process to fix.
  const socket = io()

  const [loggedIn, setLoggedIn] = useState(false);
  const user = useRef<string>("");
  const pass = useRef<string>("");
  const color = useRef<string>("");

  const videoRef = useRef<HTMLVideoElement>(null!);
  const videoSourceRef = useRef<HTMLSourceElement>(null!);
  const videoTitleRef = useRef<HTMLHeadingElement>(null!);
  // const chatRef = useRef<HTMLParagraphElement>(null!);
  const chatBoxRef = useRef<HTMLParagraphElement>(null!);
  const boxRef = useRef<HTMLInputElement>(null!);
  const syncButtonRef = useRef<HTMLButtonElement>(null!);

  const loginStateTextRef = useRef<HTMLParagraphElement>(null!);
  const userTextRef = useRef<HTMLParagraphElement>(null!);
  const userInputRef = useRef<HTMLInputElement>(null!);
  const passInputRef = useRef<HTMLInputElement>(null!);
  const colorInputRef = useRef<HTMLInputElement>(null!);
  const loginButtonRef = useRef<HTMLButtonElement>(null!);
  const loginFailMessageRef = useRef<HTMLParagraphElement>(null!);

  const videoListRef = useRef<HTMLDivElement>(null!);

  const defaultVideoSource = "/No video selected";
  // const defaultVideoSource = "/videos/hl.mp4";

  const syncState = useRef<boolean>(true);
  const cannotAlertUntil = useRef<number>(0);

  const alertState = useCallback(() => {
    if (Date.now() > cannotAlertUntil.current && syncState.current) {
      socket.emit("videoState", videoRef.current.paused, videoRef.current.currentTime, videoSourceRef.current.src, false, user.current, color.current)
      return true
    }
    return false
  }, [socket])

  const requestVideoList = useCallback(() => {
    socket.emit('videoListRequest', user.current)
  }, [socket])
  // Used to have button to call this. HTML:
  // {loggedIn ? <button onClick={requestVideoList} className="text-white bg-green-600 hover:bg-green-400 shadow-xs leading-5 rounded-base text-sm px-4 py-2.5 focus:outline-none">Update video list</button> : null}

  const appendChatText = useCallback((sender: string, senderColor: string, msg: string) => {
    const newMessage = document.createElement("p")
    newMessage.className = "text-s whitespace-pre-wrap"

    if (sender.length) {
      const senderText = document.createElement("b")
      senderText.style = `color: ${senderColor}`
      senderText.textContent = sender
      newMessage.append(senderText)
    }
    
    const msgText = document.createElement("bdi")
    msgText.textContent = msg
    newMessage.append(msgText)

    chatBoxRef.current.prepend(newMessage)
  }, [])

  function alertPlay() {
    if (alertState()) {appendChatText(user.current, color.current, " played the video.")}
  }

  function alertPause() {
    if (alertState()) {appendChatText(user.current, color.current, " paused the video.")}
  }

  function alertSeek() {
    if (alertState()) {appendChatText(user.current, color.current, ` seeked to ${Math.round(videoRef.current.currentTime)} seconds.`)}
  }

  const changeVideo = useCallback((newVideo: string, silent=false) => {
    videoSourceRef.current.src = newVideo
    const newVideoText = newVideo.slice(newVideo.lastIndexOf('/') + 1)
    videoTitleRef.current.textContent = newVideoText
    videoRef.current.load()
    if (!silent) {
      if (alertState()) {appendChatText(user.current, color.current, ` changed the video to ${newVideoText}.`)}
    }
  }, [alertState, appendChatText])

  const switchSync = useCallback(() => {
    const newSyncState = !syncState.current;
    syncState.current = newSyncState;
    syncButtonRef.current.textContent = newSyncState ? "Sync ON" : "Sync OFF";
    if (newSyncState) {
      syncButtonRef.current.classList.replace("bg-red-600", "bg-green-600")
      syncButtonRef.current.classList.replace("hover:bg-red-400", "hover:bg-green-400")
      appendChatText("", "", "Sync enabled.")
    } else {
      syncButtonRef.current.classList.replace("bg-green-600", "bg-red-600")
      syncButtonRef.current.classList.replace("hover:bg-green-400", "hover:bg-red-400")
      appendChatText("", "", "Sync disabled.")
    }
    
    if (newSyncState) {
      socket.emit("stateRequest", user.current);
    }
  }, [socket, appendChatText])

  useEffect(() => {
    socket.on('clientAuthorised', (userColor: string) => {
      console.log("Login authorised")
      setLoggedIn(true)
      if (loginButtonRef.current) {loginButtonRef.current.disabled = false}

      color.current = userColor
      loginStateTextRef.current.textContent = "Logged in as "
      userTextRef.current.style = `color: ${userColor}`
      userTextRef.current.textContent = user.current
    })

    socket.on('clientRejected', (failMessage: string) => {
      console.log("Login rejected")
      if (loginFailMessageRef.current) {loginFailMessageRef.current.textContent = failMessage}
      if (loginButtonRef.current) {loginButtonRef.current.disabled = false}
    })

    socket.on('userJoined', (newUser: string, newUserColor: string) => {
      appendChatText(newUser, newUserColor, " joined.")
    })

    socket.on('userLeft', (leavingUser: string, leavingUserColor: string) => {
      appendChatText(leavingUser, leavingUserColor, " left.")
    })
    
    socket.on('videoControl', (paused: boolean, pos: number, path: string, sender: string, senderColor: string, silent: boolean = false) => {
      cannotAlertUntil.current = Date.now() + 500

      if (videoRef.current) {
        if (syncState.current) {
          let seekMessage = true
          let msg = ""

          if (videoSourceRef.current.src != path) {
            msg = ` changed the video to ${path.slice(path.lastIndexOf('/') + 1)}.`
            changeVideo(path, true)
            seekMessage = false
          }
          if (videoRef.current.paused != paused) {
            if (paused) {
              msg = " paused the video."
              videoRef.current.pause()
            } else {
              msg = " played the video."
              videoRef.current.play().catch(() => {
                console.log("Currently unable to play the video.")
                if (syncState.current) {switchSync()} // Tried to display a message to the reader but it didn't work
              })
            }
            seekMessage = false
          }
          if (seekMessage) {
            msg = ` seeked to ${Math.round(pos)} seconds.`
          }

          if (!silent) {
            appendChatText(sender, senderColor, msg)
          }

          videoRef.current.currentTime = pos
        }
      }
    })

    socket.on("requestState", () => {
      if (videoRef.current && syncState.current) {
        socket.emit('videoState', videoRef.current.paused, videoRef.current.currentTime, videoSourceRef.current.src, true, user.current, color.current)
      }
    })

    socket.on('chatControl', (sender: string, senderColor: string, msg: string) => {
      appendChatText(sender, senderColor, ": " + msg)
    })

    socket.on('videoList', (videoList: string[]) => {
      videoListRef.current.replaceChildren()
      for (const videoName of videoList) {
        const newVideoButton = document.createElement("button")
        newVideoButton.className = "text-s hover:bg-gray-200 dark:hover:bg-gray-800 shadow-xs leading-5 py-2"
        newVideoButton.onclick = function() {
          console.log(videoName)
          changeVideo("/videos/" + videoName)
        }
        newVideoButton.textContent = videoName

        videoListRef.current.append(newVideoButton)
      }
    })
  }, [socket, appendChatText, switchSync, changeVideo])

  useEffect(() => {
    boxRef.current.addEventListener("keydown", function(event) {
      if (event.key == "Enter") {
        socket.emit('chatMessage', boxRef.current.value, user.current, color.current)
        boxRef.current.value = ""
      }
    })
  }, [socket])

  useEffect(() => {
    if (loggedIn) {
      requestVideoList()
    }
  }, [loggedIn, requestVideoList])

  const authorise = useCallback(() => {
    loginButtonRef.current.disabled = true
    user.current = userInputRef.current.value
    pass.current = passInputRef.current.value
    color.current = colorInputRef.current.value.toLowerCase().replace(/ /g, '')
    let failed = false

    if (user.current.replace(/ /g, '').length == 0) {
      loginFailMessageRef.current.textContent = "Empty username."
      failed = true
    } else if (!CSS.supports("color", color.current) && color.current.length > 0) {
      loginFailMessageRef.current.textContent = "Invalid color."
      failed = true
    }
    
    socket.emit('clientInfo', user.current, pass.current, color.current, failed, loginFailMessageRef.current.textContent, user.current, color.current)
  }, [socket])

  const logOut = useCallback(() => {
    socket.emit("logOut", user.current, color.current)
    setLoggedIn(false)
    appendChatText("", "", "You have been logged out.")
    loginStateTextRef.current.textContent = "Not logged in"
    userTextRef.current.textContent = ""
  }, [socket, appendChatText])

  useEffect(() => {
    if (userInputRef.current) {userInputRef.current.value = user.current}
    // if (passInputRef.current) {passInputRef.current.value = pass.current} // commented due to security issues
    if (colorInputRef.current) {colorInputRef.current.value = color.current}
  }, [loggedIn])

  // Runs on load.
  useEffect(() => {
    socket.emit('heartbeat', "bean")
    syncButtonRef.current.textContent = syncState.current ? "Sync ON" : "Sync OFF"
    if (!videoSourceRef.current.src) {
      changeVideo(defaultVideoSource, true)
    }
  }, [socket, changeVideo])

  console.log("Page loaded.");

  return (
    <div className="flex min-w-screen min-h-screen bg-gray-100 font-sans dark:bg-gray-900 text-black dark:text-white">
      <div className="h-dvh w-48 items-left bg-gray-200 dark:bg-gray-800 py-4 px-4 gap-2 flex-none flex flex-col">
        <h1 className="text-xl font-semibold leading-6 tracking-tight">Party Viewer</h1>
        <p className="text-s"><bdi ref={loginStateTextRef}>Not logged in</bdi><b ref={userTextRef} />.</p>
        <hr />
        <button ref={syncButtonRef} onClick={switchSync} className="text-white bg-green-600 hover:bg-green-400 shadow-xs leading-5 text-s px-4 py-2.5"/>
        {loggedIn ? <button onClick={logOut} className="text-white bg-red-600 hover:bg-red-400 shadow-xs leading-5 text-s px-4 py-2.5">Log out</button> : null}
        {loggedIn ? null : <hr />}
        {loggedIn ? null : <form className="flex flex-col gap-2">
          <input ref={userInputRef} className="text-s bg-gray-100 dark:bg-gray-900 placeholder-gray-500 py-2 px-2 width-full" placeholder="Username" />
          <input ref={passInputRef} className="text-s bg-gray-100 dark:bg-gray-900 placeholder-gray-500 py-2 px-2 width-full" placeholder="Password" />
          <input ref={colorInputRef} className="text-s bg-gray-100 dark:bg-gray-900 placeholder-gray-500 py-2 px-2 width-full" placeholder="Color (hex #rrggbb)" />
          <button ref={loginButtonRef} onClick={authorise} className="text-white bg-green-600 hover:bg-green-400 shadow-xs leading-5 text-s px-4 py-2.5">Log in</button>
          <p ref={loginFailMessageRef} className="text-s text-red-500"/>
        </form>}
        {loggedIn ? <hr /> : null}
        {loggedIn ? <h2 className="text-l font-semibold">Video switcher:</h2> : null}
        {loggedIn ? <div ref={videoListRef} className="flex flex-col flex-1 bg-gray-100 dark:bg-gray-900 overflow-y-scroll px-2 py-2" /> : null}
      </div>
      <main className="w-full justify-center py-4 px-4 sm:items-start">
        <h1 ref={videoTitleRef} className="text-xl font-semibold leading-6 tracking-tight dark:text-zinc-50"/>
        <div className="py-2"></div>
        <div className="justify-center text-center sm:items-start sm:text-left">
          <video ref={videoRef} controls={loggedIn} preload="auto" playsInline={true} onPlay={alertPlay} onPause={alertPause} onSeeked={alertSeek}>
            <source ref={videoSourceRef} />
            Your browser does not support the video tag.
          </video>
        </div>
      </main>
      <div className="h-dvh w-96 bg-gray-200 dark:bg-gray-800 py-4 px-4 flex-none flex flex-col gap-2 justify-stretch">
        <h1 className="text-xl font-semibold leading-6 tracking-tight text-black dark:text-zinc-50 flex-none">Chat</h1>
        <hr/>
        <input ref={boxRef} className="text-s px-2 py-2 width-full placeholder-gray-500 bg-gray-100 dark:bg-gray-900 flex-none" placeholder="Message" />
        <div ref={chatBoxRef} className="flex-1 py-4 px-4 bg-gray-100 dark:bg-gray-900 overflow-y-scroll" />
      </div>
    </div>
  );
}
