# Party Viewer

A web application for remote viewing of the same video from multiple locations.

## User guide

After installing the program, run ```npm install``` in the project directory to install all dependencies.

```.env``` contains a ```SERVER_PASS``` variable, which is the password users will need to use in order to log in to the app. Change this before running the application.

Download or copy any videos to ```/public/videos```.

To run the application, use ```npm run build``` followed by ```npm run start```. This will run the server on port 3000 (will fix later).

## Known issues

This project is premature in its implementation, and thus has some major vulnerabilities:

- All data is sent over HTTP as plain text.
- New files added during runtime are not viewable until the app is rerun (unless ```npm run dev``` is used).
