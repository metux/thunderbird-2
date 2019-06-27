/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from emailWizard.js */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "AddonManager", "resource://gre/modules/AddonManager.jsm");
var { logException } = ChromeUtils.import("resource:///modules/errUtils.js");

/**
 * Tries to get a configuration from an MS Exchange server
 * using Microsoft AutoDiscover protocol.
 *
 * Disclaimers:
 * - To support domain hosters, we cannot use SSL. That means we
 *   rely on insecure DNS and http, which means the results may be
 *   forged when under attack. The same is true for guessConfig(), though.
 *
 * @param {string} domain - The domain part of the user's email address
 * @param {string} emailAddress - The user's email address
 * @param {string} username - (Optional) The user's login name.
 *         If null, email address will be used.
 * @param {string} password - The user's password for that email address
 * @param {Function(config {AccountConfig})} successCallback - A callback that
 *         will be called when we could retrieve a configuration.
 *         The AccountConfig object will be passed in as first parameter.
 * @param {Function(ex)} errorCallback - A callback that
 *         will be called when we could not retrieve a configuration,
 *         for whatever reason. This is expected (e.g. when there's no config
 *         for this domain at this location),
 *         so do not unconditionally show this to the user.
 *         The first parameter will be an exception object or error string.
 */
function fetchConfigFromExchange(domain, emailAddress, username, password,
                                 successCallback, errorCallback) {
  assert(typeof(successCallback) == "function");
  assert(typeof(errorCallback) == "function");
  if (!Services.prefs.getBoolPref(
      "mailnews.auto_config.fetchFromExchange.enabled", true)) {
    errorCallback("Exchange AutoDiscover disabled per user preference");
    return new Abortable();
  }

  // <https://technet.microsoft.com/en-us/library/bb124251(v=exchg.160).aspx#Autodiscover%20services%20in%20Outlook>
  // <https://docs.microsoft.com/en-us/previous-versions/office/developer/exchange-server-interoperability-guidance/hh352638(v%3Dexchg.140)>, search for "The Autodiscover service uses one of these four methods"
  let url1 = "https://autodiscover." + sanitize.hostname(domain) +
             "/autodiscover/autodiscover.xml";
  let url2 = "https://" + sanitize.hostname(domain) +
             "/autodiscover/autodiscover.xml";
  let url3 = "http://autodiscover." + sanitize.hostname(domain) +
             "/autodiscover/autodiscover.xml";
  let body =
    `<?xml version="1.0" encoding="utf-8"?>
    <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
      <Request>
        <EMailAddress>${emailAddress}</EMailAddress>
        <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
      </Request>
    </Autodiscover>`;
  let callArgs = {
    uploadBody: body,
    post: true,
    headers: {
      // outlook.com needs this exact string, with space and lower case "utf".
      // Compare bug 1454325 comment 15.
      "Content-Type": "text/xml; charset=utf-8",
    },
    username: username || emailAddress,
    password,
    // url3 is HTTP (not HTTPS), so suppress password. Even MS spec demands so.
    requireSecureAuth: true,
    allowAuthPrompt: false,
  };
  let call;
  let fetch;
  let fetch3;

  let successive = new SuccessiveAbortable();
  let priority = new PriorityOrderAbortable(
    function(xml, call) { // success
      readAutoDiscoverResponse(xml, successive, username, password, function(config) {
        successive.current = getAddonsList(config, successCallback, errorCallback);
      }, errorCallback);
    },
    errorCallback); // all failed

  call = priority.addCall();
  fetch = new FetchHTTP(url1, callArgs,
    call.successCallback(), call.errorCallback());
  fetch.start();
  call.setAbortable(fetch);

  call = priority.addCall();
  fetch = new FetchHTTP(url2, callArgs,
    call.successCallback(), call.errorCallback());
  fetch.start();
  call.setAbortable(fetch);

  call = priority.addCall();
  fetch3 = new FetchHTTP(url3, callArgs,
    call.successCallback(), call.errorCallback());
  fetch3.start();
  call.setAbortable(fetch3);

  // url3 is an HTTP URL that will redirect to the real one, usually a HTTPS
  // URL of the hoster. XMLHttpRequest unfortunately loses the call
  // parameters, drops the auth, drops the body, and turns POST into GET,
  // which cause the call to fail, but FetchHTTP fixes this and automatically
  // repeats the call. We need that, otherwise the whole AutoDiscover
  // mechanism doesn't work.

  successive.current = priority;
  return successive;
}

var gLoopCounter = 0;

/**
 * @param {JXON} xml - The Exchange server AutoDiscover response
 * @param {Function(config {AccountConfig})} successCallback - @see accountConfig.js
 */
function readAutoDiscoverResponse(autoDiscoverXML,
  successive, username, password, successCallback, errorCallback) {
  assert(successive instanceof SuccessiveAbortable);
  assert(typeof(successCallback) == "function");
  assert(typeof(errorCallback) == "function");

  // redirect to other email address
  if ("Action" in autoDiscoverXML.Autodiscover.Response &&
      "Redirect" in autoDiscoverXML.Autodiscover.Response.Action) {
    // <https://docs.microsoft.com/en-us/previous-versions/office/developer/exchange-server-interoperability-guidance/hh352638(v%3Dexchg.140)>
    let redirectEmailAddress = sanitize.emailAddress(
        autoDiscoverXML.Autodiscover.Response.Action.Redirect);
    let domain = redirectEmailAddress.split("@").pop();
    if (++gLoopCounter > 2) {
      throw new Exception("Too many redirects in XML response");
    }
    successive.current = fetchConfigFromExchange(domain,
      redirectEmailAddress, username, password,
      successCallback, errorCallback);
  }

  let config = readAutoDiscoverXML(autoDiscoverXML, username);

  if (config.isComplete()) {
    successCallback(config);
  } else {
    errorCallback(new Exception("No valid configs found in AutoDiscover XML"));
  }
}

/* eslint-disable complexity */
/**
 * @param {JXON} xml - The Exchange server AutoDiscover response
 * @param {string} username - (Optional) The user's login name
 *     If null, email address placeholder will be used.
 * @returns {AccountConfig} - @see accountConfig.js
 *
 * @see <https://www.msxfaq.de/exchange/autodiscover/autodiscover_xml.htm>
 */
function readAutoDiscoverXML(autoDiscoverXML, username) {
  if (typeof(autoDiscoverXML) != "object" ||
      !("Autodiscover" in autoDiscoverXML) ||
      !("Response" in autoDiscoverXML.Autodiscover) ||
      !("Account" in autoDiscoverXML.Autodiscover.Response) ||
      !("Protocol" in autoDiscoverXML.Autodiscover.Response.Account)) {
    let stringBundle = getStringBundle(
      "chrome://messenger/locale/accountCreationModel.properties");
    throw new Exception(stringBundle.GetStringFromName("no_autodiscover.error"));
  }
  var xml = autoDiscoverXML.Autodiscover.Response.Account;

  function array_or_undef(value) {
    return value === undefined ? [] : value;
  }

  var config = new AccountConfig();
  config.source = AccountConfig.kSourceExchange;
  config.incoming.username = username || "%EMAILADDRESS%";
  config.incoming.socketType = 2; // only https supported
  config.incoming.port = 443;
  config.incoming.auth = Ci.nsMsgAuthMethod.passwordCleartext;
  config.incoming.authAlternatives = [ Ci.nsMsgAuthMethod.OAuth2 ];
  config.oauthSettings = {};
  config.outgoing.addThisServer = false;
  config.outgoing.useGlobalPreferredServer = true;

  for (let protocolX of array_or_undef(xml.$Protocol)) {
    try {
      let type = sanitize.enum(protocolX.Type,
                               ["WEB", "EXHTTP", "EXCH", "EXPR", "POP3", "IMAP", "SMTP"],
                               "unknown");
      if (type == "WEB") {
        let urlsX;
        if ("External" in protocolX) {
          urlsX = protocolX.External;
        } else if ("Internal" in protocolX) {
          urlsX = protocolX.Internal;
        }
        if (urlsX) {
          config.incoming.owaURL = sanitize.url(urlsX.OWAUrl.value);
          if (!config.incoming.ewsURL &&
              "Protocol" in urlsX &&
              "ASUrl" in urlsX.Protocol) {
            config.incoming.ewsURL = sanitize.url(urlsX.Protocol.ASUrl);
          }
          config.incoming.type = "exchange";
          let parsedURL = new URL(config.incoming.owaURL);
          config.incoming.hostname = sanitize.hostname(parsedURL.hostname);
          if (parsedURL.port) {
            config.incoming.port =  sanitize.integer(parsedURL.port);
          }
        }
      } else if (type == "EXHTTP" || type == "EXCH") {
        config.incoming.ewsURL = sanitize.url(protocolX.EwsUrl);
        if (!config.incoming.ewsURL) {
          config.incoming.ewsURL = sanitize.url(protocolX.ASUrl);
        }
        config.incoming.type = "exchange";
        let parsedURL = new URL(config.incoming.ewsURL);
        config.incoming.hostname = sanitize.hostname(parsedURL.hostname);
        if (parsedURL.port) {
          config.incoming.port =  sanitize.integer(parsedURL.port);
        }
      } else if (type == "POP3" || type == "IMAP" || type == "SMTP") {
        let server;
        if (type == "SMTP") {
          server = config.createNewOutgoing();
        } else {
          server = config.createNewIncoming();
        }

        server.type = sanitize.translate(type, { POP3: "pop3", IMAP: "imap", SMTP: "smtp" });
        server.hostname = sanitize.hostname(protocolX.Server);
        server.port = sanitize.integer(protocolX.Port);
        server.socketType = 1; // plain
        if ("SSL" in protocolX &&
            sanitize.enum(protocolX.SSL, ["on", "off"]) == "on") {
          // SSL is too unspecific. Do they mean STARTTLS or normal TLS?
          // For now, assume normal TLS, unless it's a standard plain port.
          switch (server.port) {
            case 143: // IMAP standard
            case 110: // POP3 standard
            case 25:  // SMTP standard
            case 587: // SMTP standard
              server.socketType = 3; // STARTTLS
              break;
            case 993: // IMAP SSL
            case 995: // POP3 SSL
            case 465: // SMTP SSL
            default: // if non-standard port, assume normal TLS, not STARTTLS
              server.socketType = 2; // normal TLS
              break;
          }
        }
        if ("SPA" in protocolX &&
            sanitize.enum(protocolX.SPA, ["on", "off"]) == "on") {
          // Secure Password Authentication = NTLM or GSSAPI/Kerberos
          server.auth = 8; // secure (not really, but this is MS...)
        }
        if ("LoginName" in protocolX) {
          server.username = sanitize.nonemptystring(protocolX.LoginName);
        } else {
          server.username = username || "%EMAILADDRESS%";
        }

        if (type == "SMTP") {
          if (!config.outgoing.hostname) {
            config.outgoing = server;
          } else {
            config.outgoingAlternatives.push(server);
          }
        } else {
          if (!config.incoming.hostname) { // eslint-disable-line no-lonely-if
            config.incoming = server;
          } else {
            config.incomingAlternatives.push(server);
          }
        }
      }

      // else unknown or unsupported protocol
    } catch (e) { logException(e); }
  }

  // OAuth2 settings, so that createInBackend() doesn't bail out
  if (config.incoming.owaURL || config.incoming.ewsURL) {
    config.oauthSettings = {
      issuer: config.incoming.hostname,
      scope: config.incoming.owaURL || config.incoming.ewsURL,
    };
  }

  return config;
}
/* eslint-enable complexity */

/**
 * Ask server which addons can handle this config.
 * @param {AccountConfig} config
 * @param {Function(config {AccountConfig})} successCallback
 * @returns {Abortable}
 */
function getAddonsList(config, successCallback, errorCallback) {
  let url = Services.prefs.getCharPref("mailnews.auto_config.addons_url");
  if (!url) {
    errorCallback(new Exception("no URL for addons list configured"));
    return new Abortable();
  }
  let fetch = new FetchHTTP(url, { allowCache: true }, function(json) {
    let addons = readAddonsJSON(json);
    addons = addons.filter(addon => {
      // Find types matching the current config.
      // Pick the first in the list as the preferred one and
      // tell the UI to use that one.
      addon.useType = addon.supportedTypes.find(type =>
        config.incoming.owaURL && type.protocolType == "owa" ||
        config.incoming.ewsURL && type.protocolType == "ews" ||
        config.incoming.easURL && type.protocolType == "eas");
      return !!addon.useType;
    });
    if (addons.length == 0) {
      errorCallback(new Exception("Config found, but no addons known to handle the config"));
      return;
    }
    config.addons = addons;
    successCallback(config);
  }, errorCallback);
  fetch.start();
  return fetch;
}

/**
 * This reads the addons list JSON and makes security validations,
 * e.g. that the URLs are not chrome: URLs, which could lead to exploits.
 * It also chooses the right language etc..
 *
 * @param {JSON} json - the addons.json file contents
 * @returns {Array of AddonInfo} - @see AccountConfig.addons
 *
 * accountTypes are listed in order of decreasing preference.
 * Languages are 2-letter codes. If a language is not available,
 * the first name or description will be used.
 *
 * Parse e.g.
[
  {
    "id": "owl@beonex.com",
    "name": {
      "en": "Owl",
      "de": "Eule"
    },
    "description": {
      "en": "Owl is a paid third-party addon that allows you to access your email account on Exchange servers. See the website for prices.",
      "de": "Eule ist eine Erweiterung von einem Drittanbieter, die Ihnen erlaubt, Exchange-Server zu benutzen. Sie ist kostenpflichtig. Die Preise finden Sie auf der Website."
    },
    "minVersion": "0.2",
    "xpiURL": "http://www.beonex.com/owl/latest.xpi",
    "websiteURL": "http://www.beonex.com/owl/",
    "icon32": "http://www.beonex.com/owl/owl-32.png",
    "accountTypes": [
      {
        "generalType": "exchange",
        "protocolType": "owa",
        "addonAccountType": "owl-owa"
      },
      {
        "generalType": "exchange",
        "protocolType": "eas",
        "addonAccountType": "owl-eas"
      }
    ]
  }
]
 */
function readAddonsJSON(json) {
  let addons = [];
  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }
  let xulLocale = Services.locale.requestedLocale;
  let locale = xulLocale ? xulLocale.substring(0, 5) : "default";
  for (let addonJSON of ensureArray(json)) {
    try {
      let addon = {
        id: addonJSON.id,
        minVersion: addonJSON.minVersion,
        xpiURL: sanitize.url(addonJSON.xpiURL),
        websiteURL: sanitize.url(addonJSON.websiteURL),
        icon32: addonJSON.icon32 ? sanitize.url(addonJSON.icon32) : null,
        supportedTypes: [],
      };
      assert(new URL(addon.xpiURL).protocol == "https:", "XPI download URL needs to be https");
      addon.name = (locale in addonJSON.name) ?
        addonJSON.name[locale] : addonJSON.name[0];
      addon.description = (locale in addonJSON.description) ?
        addonJSON.description[locale] : addonJSON.description[0];
      for (let typeJSON of ensureArray(addonJSON.accountTypes)) {
        try {
          addon.supportedTypes.push({
            generalType: sanitize.alphanumdash(typeJSON.generalType),
            protocolType: sanitize.alphanumdash(typeJSON.protocolType),
            addonAccountType: sanitize.alphanumdash(typeJSON.addonAccountType),
          });
        } catch (e) {
          ddump(e);
        }
      }
      addons.push(addon);
    } catch (e) {
      ddump(e);
    }
  }
  return addons;
}
