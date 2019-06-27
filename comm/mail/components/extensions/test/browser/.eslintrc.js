"use strict";

module.exports = {
  "extends": "plugin:mozilla/browser-test",

  "env": {
    "webextensions": true,
  },

  "rules": {
    "func-names": "off",
    "mozilla/import-headjs-globals": "error",
  },
};
