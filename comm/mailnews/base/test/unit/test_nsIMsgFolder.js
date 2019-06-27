/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgFolder functions.
 */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

function run_test() {
  // Create a local mail account (we need this first)
  MailServices.accounts.createLocalMailAccount();

  // Get the account
  let account = MailServices.accounts.accounts.queryElementAt(0, Ci.nsIMsgAccount);

  // Get the root folder
  var root = account.incomingServer.rootFolder;

  // Add a sub folder to ensure that we have some folders created
  root.createSubfolder("folder1", null);

  // Test - getChildNamed

  var caught = false;
  try {
    root.getChildNamed("folder");
  } catch (e) {
    caught = true;
  }
  Assert.equal(caught, true);

  caught = false;
  try {
    root.getChildNamed("Trash1");
  } catch (e) {
    caught = true;
  }
  Assert.equal(caught, true);

  var folder1 = root.getChildNamed("folder1");

  Assert.notEqual(folder1, folder2);
  Assert.equal(folder1.prettyName, "folder1");

  var folder2 = root.getChildNamed("FOLDER1");

  Assert.equal(folder1, folder2);

  // Check special folders aren't deletable, and that normal folders are.
  if (!root.containsChildNamed("Inbox"))
    root.createSubfolder("Inbox", null);
  var inbox = root.getChildNamed("Inbox");
  inbox.setFlag(Ci.nsMsgFolderFlags.Inbox);
  Assert.ok(!inbox.deletable);

  if (!root.containsChildNamed("Drafts"))
    root.createSubfolder("Drafts", null);
  var drafts = root.getChildNamed("Drafts");
  drafts.setFlag(Ci.nsMsgFolderFlags.Drafts);
  Assert.ok(!drafts.deletable);

  if (!root.containsChildNamed("Templates"))
    root.createSubfolder("Templates", null);
  var templates = root.getChildNamed("Templates");
  templates.setFlag(Ci.nsMsgFolderFlags.Templates);
  Assert.ok(!templates.deletable);

  if (!root.containsChildNamed("Sent"))
     root.createSubfolder("Sent", null);
  var sent = root.getChildNamed("Sent");
  sent.setFlag(Ci.nsMsgFolderFlags.SentMail);
  Assert.ok(!sent.deletable);

  if (!root.containsChildNamed("Archives"))
    root.createSubfolder("Archives", null);
  var archives = root.getChildNamed("Archives");
  archives.setFlag(Ci.nsMsgFolderFlags.Archive);
  Assert.ok(!archives.deletable);

  if (!root.containsChildNamed("Trash"))
    root.createSubfolder("Trash", null);
  var trash = root.getChildNamed("Trash");
  trash.setFlag(Ci.nsMsgFolderFlags.Trash);
  Assert.ok(!trash.deletable);

  if (!root.containsChildNamed("Outbox"))
    root.createSubfolder("Outbox", null);
  var outbox = root.getChildNamed("Outbox");
  outbox.setFlag(Ci.nsMsgFolderFlags.Queue);
  Assert.ok(!outbox.deletable);

  // test a normal folder is deletable
  Assert.ok(folder1.deletable);
}
