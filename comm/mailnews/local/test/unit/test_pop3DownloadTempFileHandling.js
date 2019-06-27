/**
 * The intent of this file is to test temp file handling when
 * downloading multiple pop3 messages with quarantining turned on.
 *
 * Original author: David Bienvenu <dbienvenu@mozilla.com>
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var testSubjects = ["[Bug 397009] A filter will let me tag, but not untag",
                    "Hello, did you receive my bugmail?"];
var gExpectedFiles;

function run_test() {
  Services.prefs.setBoolPref("mailnews.downloadToTempFile", true);
  gExpectedFiles = createExpectedTemporaryFiles(2);
  // add 2 messages
  gPOP3Pump.files = ["../../../data/bugmail1",
                     "../../../data/draft1"];
  gPOP3Pump.onDone = continueTest;
  do_test_pending();
  gPOP3Pump.run();
}

function continueTest() {
  dump("temp file path = " + gExpectedFiles[0].path + "\n");
  dump("temp file path = " + gExpectedFiles[1].path + "\n");
  for (let expectedFile of gExpectedFiles)
    Assert.ok(!expectedFile.exists());

  // get message headers for the inbox folder
  let enumerator = localAccountUtils.inboxFolder.msgDatabase.EnumerateMessages();
  var msgCount = 0;
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    Assert.equal(hdr.subject, testSubjects[msgCount++]);
  }
  Assert.equal(msgCount, 2);
  gPOP3Pump = null;
  do_test_finished();
}

function createExpectedTemporaryFiles(numFiles) {
  function createTemporaryFile() {
    let file = Services.dirsvc.get("TmpD", Ci.nsIFile);
    file.append("newmsg");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    return file;
  }

  let expectedFiles = [];
  for (let i = 0; i < numFiles; i++)
    expectedFiles.push(createTemporaryFile());

  for (let expectedFile of expectedFiles)
    expectedFile.remove(false);

  return expectedFiles;
}


