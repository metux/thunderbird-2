/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgHeaderParser function removeDuplicateAddresses:
 */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

function run_test() {
  const checks = [
    { addrs: "test@foo.invalid",
      otherAddrs: "",
      expectedResult: "test@foo.invalid" },
    { addrs: "foo bar <test@foo.invalid>",
      otherAddrs: "",
      expectedResult: "foo bar <test@foo.invalid>" },
    { addrs: "foo bar <test@foo.invalid>, abc@foo.invalid",
      otherAddrs: "",
      expectedResult: "foo bar <test@foo.invalid>, abc@foo.invalid" },
    { addrs: "foo bar <test@foo.invalid>, abc@foo.invalid, test <test@foo.invalid>",
      otherAddrs: "",
      expectedResult: "foo bar <test@foo.invalid>, abc@foo.invalid" },
    { addrs: "foo bar <test@foo.invalid>",
      otherAddrs: "abc@foo.invalid",
      expectedResult: "foo bar <test@foo.invalid>" },
    { addrs: "foo bar <test@foo.invalid>",
      otherAddrs: "foo bar <test@foo.invalid>",
      expectedResult: "" },
    { addrs: "foo bar <test@foo.invalid>, abc@foo.invalid",
      otherAddrs: "foo bar <test@foo.invalid>",
      expectedResult: "abc@foo.invalid" },
    { addrs: "foo bar <test@foo.invalid>, abc@foo.invalid",
      otherAddrs: "abc@foo.invalid",
      expectedResult: "foo bar <test@foo.invalid>" },
    { addrs: "foo bar <test@foo.invalid>, abc@foo.invalid, test <test@foo.invalid>",
      otherAddrs: "abc@foo.invalid",
      expectedResult: "foo bar <test@foo.invalid>" },
    // UTF-8 names
    { addrs: "foo\u00D0 bar <foo@bar.invalid>, \u00F6foo <ghj@foo.invalid>",
      otherAddrs: "",
      expectedResult: "foo\u00D0 bar <foo@bar.invalid>, \u00F6foo <ghj@foo.invalid>" },
    { addrs: "foo\u00D0 bar <foo@bar.invalid>, \u00F6foo <ghj@foo.invalid>",
      otherAddrs: "foo\u00D0 bar <foo@bar.invalid>",
      expectedResult: "\u00F6foo <ghj@foo.invalid>" },
    { addrs: "foo\u00D0 bar <foo@bar.invalid>, \u00F6foo <ghj@foo.invalid>, foo\u00D0 bar <foo@bar.invalid>",
      otherAddrs: "\u00F6foo <ghj@foo.invalid>",
      expectedResult: "foo\u00D0 bar <foo@bar.invalid>" },
    // Test email groups
    { addrs: "A group: foo bar <foo@bar.invalid>, foo <ghj@foo.invalid>;",
      otherAddrs: "foo <ghj@foo.invalid>",
      expectedResult: "A group: foo bar <foo@bar.invalid>;" },
    { addrs: "A group: foo bar <foo@bar.invalid>, foo <ghj@foo.invalid>;",
      otherAddrs: "foo bar <ghj@foo.invalid>",
      expectedResult: "A group: foo bar <foo@bar.invalid>;" },
    { addrs: "A group: foo bar <foo@bar.invalid>;, foo <ghj@foo.invalid>",
      otherAddrs: "foo <foo@bar.invalid>",
      expectedResult: "A group: ; , foo <ghj@foo.invalid>" },
  ];

  // Test - empty strings

  Assert.equal(MailServices.headerParser.removeDuplicateAddresses("", ""), "");
  Assert.equal(MailServices.headerParser.removeDuplicateAddresses("", "test@foo.invalid"), "");

  // Test - removeDuplicateAddresses

  for (let i = 0; i < checks.length; ++i) {
    dump("Test " + i + "\n");
    Assert.equal(MailServices.headerParser.removeDuplicateAddresses(checks[i].addrs,
                 checks[i].otherAddrs),
    checks[i].expectedResult);
  }
}
