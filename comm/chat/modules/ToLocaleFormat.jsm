/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

this.EXPORTED_SYMBOLS = ["ToLocaleFormat"];

// JS implementation of the deprecated Date.toLocaleFormat.
// aFormat follows strftime syntax,
// http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html

function Day(t) {
  return Math.floor(t.valueOf() / 86400000);
}
function DayFromYear(y) {
  return 365 * (y - 1970) +
    Math.floor((y - 1969) / 4) -
    Math.floor((y - 1901) / 100) +
    Math.floor((y - 1601) / 400);
}
function DayWithinYear(t) {
  return Day(t) - DayFromYear(t.getFullYear());
}
function weekday(aDate, option) {
  return aDate.toLocaleString(undefined, {weekday: option});
}
function month(aDate, option) {
  return aDate.toLocaleString(undefined, {month: option});
}
function hourMinSecTwoDigits(aDate) {
  return aDate.toLocaleString(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function dayPeriod(aDate) {
  let dtf = Intl.DateTimeFormat(undefined, {hour: "2-digit"});
  let dayPeriodPart =
    dtf.resolvedOptions().hour12 &&
    dtf.formatToParts(aDate).find(part => part.type === "dayPeriod");
  return dayPeriodPart ? dayPeriodPart.value : "";
}
function weekNumber(aDate, weekStart) {
  let day = aDate.getDay();
  if (weekStart) {
    day = (day || 7) - weekStart;
  }
  return Math.max(Math.floor((DayWithinYear(aDate) + 7 - day) / 7), 0);
}
function weekNumberISO(t) {
  let thisWeek = weekNumber(1, t);
  let firstDayOfYear =
    (new Date(t.getFullYear(), 0, 1).getDay() || 7) - 1;
  if (thisWeek === 0 && firstDayOfYear >= 4)
    return weekNumberISO(new Date(t.getFullYear() - 1, 11, 31));
  if (t.getMonth() === 11 &&
      (t.getDate() - ((t.getDay() || 7) - 1)) >= 29)
    return 1;
  return thisWeek + (firstDayOfYear > 0 && firstDayOfYear < 4);
}
function weekYearISO(aDate) {
  let thisWeek = weekNumber(1, aDate);
  let firstDayOfYear =
    (new Date(aDate.getFullYear(), 0, 1).getDay() || 7) - 1;
  if (thisWeek === 0 && firstDayOfYear >= 4)
    return aDate.getFullYear() - 1;
  if (aDate.getMonth() === 11 &&
      (aDate.getDate() - ((aDate.getDay() || 7) - 1)) >= 29)
    return aDate.getFullYear() + 1;
  return aDate.getFullYear();
}
function timeZoneOffset(aDate) {
  let offset = aDate.getTimezoneOffset();
  let tzoff =
    Math.floor(Math.abs(offset) / 60) * 100 + Math.abs(offset) % 60;
  return (offset < 0 ? "+" : "-") + String(tzoff).padStart(4, "0");
}
function timeZone(aDate) {
  let dtf = Intl.DateTimeFormat(undefined, {timeZoneName: "short"});
  let timeZoneNamePart = dtf.formatToParts(aDate)
                            .find(part => part.type === "timeZoneName");
  return timeZoneNamePart ? timeZoneNamePart.value : "";
}

const dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "full", timeStyle: "long",
});
const dateFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "full",
});
const timeFormatter = new Services.intl.DateTimeFormat(undefined, {
  timeStyle: "long",
});

const formatFunctions = {
  a: aDate => weekday(aDate, "short"),
  A: aDate => weekday(aDate, "long"),
  b: aDate => month(aDate, "short"),
  B: aDate => month(aDate, "long"),
  c: aDate => dateTimeFormatter.format(aDate),
  C: aDate => String(Math.trunc(aDate.getFullYear() / 100)),
  d: aDate => String(aDate.getDate()),
  D: aDate => ToLocaleFormat("%m/%d/%y", aDate),
  e: aDate => String(aDate.getDate()),
  F: aDate => ToLocaleFormat("%Y-%m-%d", aDate),
  g: aDate => String(weekYearISO(aDate) % 100),
  G: aDate => String(weekYearISO(aDate)),
  h: aDate => month(aDate, "short"),
  H: aDate => String(aDate.getHours()),
  I: aDate => String(aDate.getHours() % 12 || 12),
  j: aDate => String(DayWithinYear(aDate) + 1),
  k: aDate => String(aDate.getHours()),
  l: aDate => String(aDate.getHours() % 12 || 12),
  m: aDate => String(aDate.getMonth() + 1),
  M: aDate => String(aDate.getMinutes()),
  n: () => "\n",
  p: aDate => dayPeriod(aDate).toLocaleUpperCase(),
  P: aDate => dayPeriod(aDate).toLocaleLowerCase(),
  r: aDate => hourMinSecTwoDigits(aDate),
  R: aDate => ToLocaleFormat("%H:%M", aDate),
  s: aDate => String(Math.trunc(aDate.getTime() / 1000)),
  S: aDate => String(aDate.getSeconds()),
  t: () => "\t",
  T: aDate => ToLocaleFormat("%H:%M:%S", aDate),
  u: aDate => String(aDate.getDay() || 7),
  U: aDate => String(weekNumber(aDate, 0)),
  V: aDate => String(weekNumberISO(aDate)),
  w: aDate => String(aDate.getDay()),
  W: aDate => String(weekNumber(aDate, 1)),
  x: aDate => dateFormatter.format(aDate),
  X: aDate => timeFormatter.format(aDate),
  y: aDate => String(aDate.getFullYear() % 100),
  Y: aDate => String(aDate.getFullYear()),
  z: aDate => timeZoneOffset(aDate),
  Z: aDate => timeZone(aDate),
  "%": () => "%",
};
const padding = {
  C: {fill: "0", width: 2},
  d: {fill: "0", width: 2},
  e: {fill: " ", width: 2},
  g: {fill: "0", width: 2},
  H: {fill: "0", width: 2},
  I: {fill: "0", width: 2},
  j: {fill: "0", width: 3},
  k: {fill: " ", width: 2},
  l: {fill: " ", width: 2},
  m: {fill: "0", width: 2},
  M: {fill: "0", width: 2},
  S: {fill: "0", width: 2},
  U: {fill: "0", width: 2},
  V: {fill: "0", width: 2},
  W: {fill: "0", width: 2},
  y: {fill: "0", width: 2},
};

function ToLocaleFormat(aFormat, aDate) {
  // Modified conversion specifiers E and O are ignored.
  let specifiers = Object.keys(formatFunctions).join("");
  let pattern =
    RegExp(`%#?(\\^)?([0_-]\\d*)?(?:[EO])?([${specifiers}])`, "g");

  return aFormat.replace(pattern,
    (matched, upperCaseFlag, fillWidthFlags, specifier) => {
      let result = formatFunctions[specifier](aDate);
      if (upperCaseFlag)
        result = result.toLocaleUpperCase();
      let fill = (specifier in padding) ? padding[specifier].fill : "";
      let width = (specifier in padding) ? padding[specifier].width : 0;
      if (fillWidthFlags) {
        let newFill = fillWidthFlags[0];
        let newWidth = fillWidthFlags.match(/\d+/);
        if (newFill === "-" && newWidth === null)
          fill = "";
        else {
          fill = newFill === "0" ? "0" : " ";
          width = newWidth !== null ? Number(newWidth) : width;
        }
      }
      return result.padStart(width, fill);
    });
}
