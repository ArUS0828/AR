/**
 * PRIVATE CHAT — Google Apps Script backend
 * ------------------------------------------
 * This script turns a Google Sheet into a tiny API for the chat app.
 *
 * SHEET SETUP (create a new Google Sheet, then add these two tabs):
 *
 * Tab 1: "Users"
 *   Row 1 (header): Username | Password
 *   Row 2:          User1    | pass123
 *   Row 3:          User2    | pass456
 *
 * Tab 2: "Messages"
 *   Row 1 (header): ID | Sender | Message | Timestamp
 *   (leave the rest empty — the script fills it in)
 *
 * DEPLOY:
 *   1. In the Sheet, go to Extensions > Apps Script.
 *   2. Delete any starter code, paste this whole file in.
 *   3. Click Deploy > New deployment > select type "Web app".
 *   4. Execute as: Me.  Who has access: Anyone.
 *   5. Click Deploy, authorize it, and copy the Web App URL.
 *   6. Paste that URL into app.js as APPS_SCRIPT_URL.
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = e.parameter;
  var action = params.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var output;

  try {
    if (action === 'login') {
      output = login(ss, params.username, params.password);
    } else if (action === 'send') {
      output = sendMessage(ss, params.sender, params.message);
    } else if (action === 'fetch') {
      output = fetchMessages(ss, params.since);
    } else {
      output = { status: 'error', message: 'Unknown action' };
    }
  } catch (err) {
    output = { status: 'error', message: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function login(ss, username, password) {
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(username).trim() &&
        String(data[i][1]).trim() === String(password).trim()) {
      return { status: 'success', user: data[i][0] };
    }
  }
  return { status: 'error', message: 'Wrong username or password' };
}

function sendMessage(ss, sender, message) {
  var sheet = ss.getSheetByName('Messages');
  var id = new Date().getTime();
  sheet.appendRow([id, sender, message, new Date()]);
  return { status: 'success', id: id };
}

function fetchMessages(ss, since) {
  var sheet = ss.getSheetByName('Messages');
  var data = sheet.getDataRange().getValues();
  var messages = [];
  var sinceNum = Number(since) || 0;

  for (var i = 1; i < data.length; i++) {
    var id = Number(data[i][0]);
    if (id > sinceNum) {
      messages.push({
        id: id,
        sender: data[i][1],
        message: data[i][2],
        timestamp: data[i][3]
      });
    }
  }
  return { status: 'success', messages: messages };
}
