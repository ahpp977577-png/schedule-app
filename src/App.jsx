import { useEffect, useMemo, useState } from "react";

const defaultPlatforms = [
  "ND 1001-3000",
  "ND 3001以上",
  "HS 2501以上 SY",
  "YD 2501以上 LY",
  "HS 2500以下",
  "YD 2500以下",
  "ND 1000以下",
  "JD JY YS",
  "XO XH SH",
  "LS MT",
  "OL",
  "XY FB",
  "支援 HS ND YD 外部",
];

const defaultPeople = [
  "人員01",
  "人員02",
  "人員03",
  "人員04",
  "人員05",
  "人員06",
  "人員07",
  "人員08",
  "人員09",
  "人員10",
  "人員11",
  "人員12",
];

const googleDefaultUrl =
  "https://docs.google.com/spreadsheets/d/1mjRlSp1tZ8fNaobYCqyb3nPU3Wg2hTogtQ7FtwzYnHI/edit?gid=629508541#gid=629508541";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getWeekday(year, month, day) {
  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  return labels[new Date(year, month - 1, day).getDay()];
}

function isWeekend(year, month, day) {
  const w = new Date(year, month - 1, day).getDay();
  return w === 0 || w === 6;
}

function getWorkload(platform = "") {
  if (!platform || platform === "休") return "休";

  if (
    platform.includes("ND 1001") ||
    platform.includes("ND 3001") ||
    platform.includes("HS 2501") ||
    platform.includes("YD 2501")
  ) {
    return "高";
  }

  if (
    platform.includes("HS 2500") ||
    platform.includes("YD 2500") ||
    platform.includes("ND 1000") ||
    platform.includes("OL") ||
    platform.includes("支援")
  ) {
    return "中";
  }

  return "低";
}

function getSeries(platform = "") {
  if (platform.includes("ND")) return "ND";
  if (platform.includes("YD")) return "YD";
  if (platform.includes("HS")) return "HS";
  return platform.split(" ")[0] || platform;
}

function isSmallPlatform(platform = "") {
  return (
    platform.includes("JD") ||
    platform.includes("JY") ||
    platform.includes("YS") ||
    platform.includes("XO") ||
    platform.includes("XH") ||
    platform.includes("SH") ||
    platform.includes("LS") ||
    platform.includes("MT") ||
    platform.includes("XY") ||
    platform.includes("FB")
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replaceAll("１", "1")
    .replaceAll("：", ":")
    .replaceAll("，", ",")
    .replaceAll("、", ",");
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function parseLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueArray(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

function googleSheetUrlToCsvUrl(url) {
  const idMatch = String(url).match(/\/spreadsheets\/d\/([^/]+)/);
  const gidMatch = String(url).match(/[?&#]gid=(\d+)/);

  if (!idMatch) {
    throw new Error("Google Sheets 連結格式不正確");
  }

  const sheetId = idMatch[1];
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseHolidayTextToMap(text, daysInMonth) {
  const map = {};

  parseLines(text).forEach((line) => {
    const normalized = line.replaceAll("：", ":");
    const parts = normalized.split(":");
    if (parts.length < 2) return;

    const person = parts[0].trim();
    const dayText = parts.slice(1).join(":").trim();
    if (!person || !dayText) return;

    if (!map[person]) map[person] = [];

    dayText
      .replaceAll("，", ",")
      .replaceAll("、", ",")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (item.includes("-")) {
          const [start, end] = item.split("-").map((x) => Number(x.trim()));
          if (
            Number.isInteger(start) &&
            Number.isInteger(end) &&
            start >= 1 &&
            end <= daysInMonth &&
            start <= end
          ) {
            for (let d = start; d <= end; d++) map[person].push(d);
          }
        } else {
          const day = Number(item);
          if (Number.isInteger(day) && day >= 1 && day <= daysInMonth) {
            map[person].push(day);
          }
        }
      });

    map[person] = uniqueArray(map[person]).sort((a, b) => a - b);
  });

  return map;
}

function mapToHolidayText(map) {
  return Object.entries(map)
    .map(
      ([person, days]) =>
        `${person}：${[...days].sort((a, b) => a - b).join(",")}`
    )
    .join("\n");
}

function parseGoogleSheetHolidayRows(rows, daysInMonth) {
  let headerRowIndex = -1;
  let dateColumns = [];

  rows.forEach((row, rowIndex) => {
    const cols = [];
    row.forEach((cell, colIndex) => {
      const n = Number(normalizeText(cell));
      if (Number.isInteger(n) && n >= 1 && n <= daysInMonth) {
        cols.push({ colIndex, day: n });
      }
    });

    if (cols.length > dateColumns.length) {
      dateColumns = cols;
      headerRowIndex = rowIndex;
    }
  });

  if (headerRowIndex < 0 || dateColumns.length < 10) {
    throw new Error("找不到日期欄位，請確認表格上方有 1～31 日期");
  }

  const firstDateCol = Math.min(...dateColumns.map((x) => x.colIndex));
  const holidayMap = {};
  const dateColumnMap = new Map(dateColumns.map((x) => [x.colIndex, x.day]));

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    let person = "";

    for (let c = 0; c < firstDateCol; c++) {
      const value = String(row[c] || "").trim();
      if (value) {
        person = value;
        break;
      }
    }

    if (!person) continue;

    const skipWords = [
      "一",
      "二",
      "三",
      "四",
      "五",
      "六",
      "日",
      "天數",
      "天数",
      "合計",
      "小計",
    ];
    if (skipWords.includes(person)) continue;

    const days = [];
    for (const [colIndex, day] of dateColumnMap.entries()) {
      const value = normalizeText(row[colIndex]);
      if (value === "1") days.push(day);
    }

    if (days.length > 0) {
      holidayMap[person] = uniqueArray(days).sort((a, b) => a - b);
    }
  }

  return holidayMap;
}

function countDailyHolidays(holidayMap, day) {
  return Object.values(holidayMap).filter((days) => days.includes(day)).length;
}

function downloadTextFile(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsvValue(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildExcelCsv(schedule, people, year, month) {
  const header = ["日期", "星期", ...people];
  const rows = [header];

  schedule.forEach((dayRow) => {
    rows.push([
      `${year}/${month}/${dayRow.day}`,
      getWeekday(year, month, dayRow.day),
      ...people.map((person) => dayRow.assignments[person] || ""),
    ]);
  });

  return "\uFEFF" + rows.map((r) => r.map(toCsvValue).join(",")).join("\n");
}

function getRecentAssignments(previousAssignments, person, day, range = 3) {
  const result = [];
  for (let d = day - 1; d >= Math.max(1, day - range); d--) {
    const value = previousAssignments[d]?.[person];
    if (value && value !== "休") result.push(value);
  }
  return result;
}

function violatesHardRules(platform, recent) {
  const prev1 = recent[0] || "";
  const prev2 = recent[1] || "";
  const prev3 = recent[2] || "";

  if (platform === prev1 || platform === prev2 || platform === prev3) return true;

  const series = getSeries(platform);
  const prevSeries = getSeries(prev1);
  if (["ND", "YD", "HS"].includes(series) && series === prevSeries) {
    return true;
  }

  if (getWorkload(platform) === "高" && getWorkload(prev1) === "高") {
    return true;
  }

  if (isSmallPlatform(platform)) {
    const recentSmallCount = recent.filter((x) => isSmallPlatform(x)).length;
    if (recentSmallCount >= 2) return true;
  }

  return false;
}

function getPersonPlatformTargetMax(person, platforms, holidayMap, daysInMonth) {
  if (!platforms.length) return Infinity;

  const restDays = (holidayMap[person] || []).length;
  const workDays = Math.max(0, daysInMonth - restDays);

  return Math.max(1, Math.ceil(workDays / platforms.length));
}

function getPlatformScore({
  person,
  platform,
  day,
  previousAssignments,
  personPlatformCount,
  dailyUsedPlatforms,
  personTargetMax,
}) {
  const recent = getRecentAssignments(previousAssignments, person, day, 3);
  const currentCount = personPlatformCount[person]?.[platform] || 0;
  const targetMax = personTargetMax?.[person] ?? Infinity;

  let score = 0;

  // 核心：個人同一崗位次數不得過度集中。
  // 例如本月上班 21 天、13 個崗位，單一崗位理想上限為 2 次。
  // 超過上限時給極高分，讓系統優先選其他尚未滿額的崗位。
  if (currentCount >= targetMax) {
    score += 250000 + (currentCount - targetMax + 1) * 80000;
  }

  // 讓同一個人各崗位次數平均，接近 ±1。
  score += currentCount * 120;

  // 避免同一天全部人同崗；同崗越多人，分數越高。
  score += (dailyUsedPlatforms[platform] || 0) * 150;

  // 高、中、低工作量盡量輪替。
  const prev1 = recent[0] || "";
  if (getWorkload(platform) === getWorkload(prev1)) score += 24;

  // 小平台不要過密。
  if (isSmallPlatform(platform)) {
    score += recent.filter((x) => isSmallPlatform(x)).length * 80;
  }

  // 微量亂數，避免每次完全固定。
  score += Math.random() * 3;

  return score;
}

function chooseBestPlatform({
  person,
  platforms,
  day,
  previousAssignments,
  personPlatformCount,
  dailyUsedPlatforms,
  personTargetMax,
}) {
  const recent = getRecentAssignments(previousAssignments, person, day, 3);
  const targetMax = personTargetMax?.[person] ?? Infinity;

  const hardValidCandidates = platforms.filter(
    (platform) => !violatesHardRules(platform, recent)
  );

  // 優先選「未超過個人崗位上限」的崗位，避免統計出現 3、4 次集中。
  const quotaValidCandidates = hardValidCandidates.filter((platform) => {
    const currentCount = personPlatformCount[person]?.[platform] || 0;
    return currentCount < targetMax;
  });

  const candidates =
    quotaValidCandidates.length > 0
      ? quotaValidCandidates
      : hardValidCandidates.length > 0
        ? hardValidCandidates
        : platforms;

  return candidates
    .map((platform) => ({
      platform,
      score: getPlatformScore({
        person,
        platform,
        day,
        previousAssignments,
        personPlatformCount,
        dailyUsedPlatforms,
        personTargetMax,
      }),
    }))
    .sort((a, b) => a.score - b.score)[0]?.platform;
}

function rotateArray(arr, offset) {
  if (!arr.length) return [];
  const n = offset % arr.length;
  return [...arr.slice(n), ...arr.slice(0, n)];
}

function generateAutoSchedule({ people, platforms, holidayMap, year, month }) {
  const daysInMonth = getDaysInMonth(year, month);
  const previousAssignments = {};
  const personPlatformCount = {};
  const personTargetMax = {};
  const result = [];

  people.forEach((person) => {
    personPlatformCount[person] = {};
    personTargetMax[person] = getPersonPlatformTargetMax(
      person,
      platforms,
      holidayMap,
      daysInMonth
    );

    platforms.forEach((platform) => {
      personPlatformCount[person][platform] = 0;
    });
  });

  for (let day = 1; day <= daysInMonth; day++) {
    const assignments = {};
    const dailyUsedPlatforms = {};

    const holidayPeople = people.filter((person) =>
      (holidayMap[person] || []).includes(day)
    );

    const workingPeople = people.filter(
      (person) => !(holidayMap[person] || []).includes(day)
    );

    holidayPeople.forEach((person) => {
      assignments[person] = "休";
    });

    // 每天人員順序與崗位順序都輪替，避免每天固定同一批人先拿好崗位。
    const rotatedPeople = rotateArray(workingPeople, day - 1);
    const rotatedPlatforms = rotateArray(platforms, day - 1);

    // 第一輪：優先把不同崗位分散出去，避免整天全部同崗。
    // 同時加入個人崗位上限判斷，避免某個人同崗位被排到 3 次以上。
    const availablePeople = [...rotatedPeople];
    const dailyRequiredPlatforms = rotatedPlatforms.slice(
      0,
      Math.min(rotatedPlatforms.length, availablePeople.length)
    );

    dailyRequiredPlatforms.forEach((targetPlatform) => {
      if (!availablePeople.length) return;

      const rankedPeople = availablePeople
        .map((person) => {
          const recent = getRecentAssignments(previousAssignments, person, day, 3);
          const hardPenalty = violatesHardRules(targetPlatform, recent) ? 100000 : 0;
          const currentCount = personPlatformCount[person]?.[targetPlatform] || 0;
          const targetMax = personTargetMax[person] ?? Infinity;
          const quotaPenalty =
            currentCount >= targetMax
              ? 300000 + (currentCount - targetMax + 1) * 90000
              : 0;

          return {
            person,
            score:
              hardPenalty +
              quotaPenalty +
              getPlatformScore({
                person,
                platform: targetPlatform,
                day,
                previousAssignments,
                personPlatformCount,
                dailyUsedPlatforms,
                personTargetMax,
              }),
          };
        })
        .sort((a, b) => a.score - b.score);

      const chosenPerson = rankedPeople[0].person;
      assignments[chosenPerson] = targetPlatform;
      dailyUsedPlatforms[targetPlatform] = (dailyUsedPlatforms[targetPlatform] || 0) + 1;
      personPlatformCount[chosenPerson][targetPlatform] =
        (personPlatformCount[chosenPerson][targetPlatform] || 0) + 1;

      const index = availablePeople.indexOf(chosenPerson);
      if (index >= 0) availablePeople.splice(index, 1);
    });

    // 第二輪：若人數多於崗位，剩餘人員再依規則補最適合崗位。
    availablePeople.forEach((person) => {
      const chosenPlatform = chooseBestPlatform({
        person,
        platforms,
        day,
        previousAssignments,
        personPlatformCount,
        dailyUsedPlatforms,
        personTargetMax,
      });

      assignments[person] = chosenPlatform;
      dailyUsedPlatforms[chosenPlatform] = (dailyUsedPlatforms[chosenPlatform] || 0) + 1;
      personPlatformCount[person][chosenPlatform] =
        (personPlatformCount[person][chosenPlatform] || 0) + 1;
    });

    previousAssignments[day] = assignments;

    result.push({
      day,
      weekday: getWeekday(year, month, day),
      assignments,
    });
  }

  return result;
}

export default function App() {
  const [yearMonth, setYearMonth] = useState(
    () => localStorage.getItem("schedule_yearMonth") || "2026-05"
  );

  const [minDailyHoliday, setMinDailyHoliday] = useState(() =>
    Number(localStorage.getItem("schedule_minDailyHoliday") || 4)
  );

  const [maxDailyHoliday, setMaxDailyHoliday] = useState(() =>
    Number(localStorage.getItem("schedule_maxDailyHoliday") || 5)
  );

  const [peopleText, setPeopleText] = useState(
    () => localStorage.getItem("schedule_peopleText") || defaultPeople.join("\n")
  );

  const [platformText, setPlatformText] = useState(
    () => localStorage.getItem("schedule_platformText") || defaultPlatforms.join("\n")
  );

  const [holidayText, setHolidayText] = useState(
    () =>
      localStorage.getItem("schedule_holidayText") ||
      "大抠：2,7,12,16,17,21,25,29\n宏：1,6,9,15,20,25,30,31\nYU：1,6,10,14,17,23,24,29"
  );

  const [holidayMap, setHolidayMap] = useState(() =>
    safeJsonParse(localStorage.getItem("schedule_holidayMap"), {})
  );

  const [schedule, setSchedule] = useState(() =>
    safeJsonParse(localStorage.getItem("schedule_result"), [])
  );

  const [googleUrl, setGoogleUrl] = useState(
    () => localStorage.getItem("schedule_googleUrl") || googleDefaultUrl
  );

  const [message, setMessage] = useState("班表狀態：未鎖定。");
  const [isHolidayGridReady, setIsHolidayGridReady] = useState(false);
  const [isLocked, setIsLocked] = useState(
    () => localStorage.getItem("schedule_locked") === "true"
  );

  const [manualDay, setManualDay] = useState("");
  const [manualPerson, setManualPerson] = useState("");
  const [manualPlatform, setManualPlatform] = useState("");

  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = getDaysInMonth(year, month);

  const people = useMemo(() => uniqueArray(parseLines(peopleText)), [peopleText]);
  const platforms = useMemo(
    () => uniqueArray(parseLines(platformText)),
    [platformText]
  );

  useEffect(() => {
    localStorage.setItem("schedule_yearMonth", yearMonth);
    localStorage.setItem("schedule_minDailyHoliday", String(minDailyHoliday));
    localStorage.setItem("schedule_maxDailyHoliday", String(maxDailyHoliday));
    localStorage.setItem("schedule_peopleText", peopleText);
    localStorage.setItem("schedule_platformText", platformText);
    localStorage.setItem("schedule_holidayText", holidayText);
    localStorage.setItem("schedule_holidayMap", JSON.stringify(holidayMap));
    localStorage.setItem("schedule_result", JSON.stringify(schedule));
    localStorage.setItem("schedule_googleUrl", googleUrl);
    localStorage.setItem("schedule_locked", String(isLocked));
  }, [
    yearMonth,
    minDailyHoliday,
    maxDailyHoliday,
    peopleText,
    platformText,
    holidayText,
    holidayMap,
    schedule,
    googleUrl,
    isLocked,
  ]);

  function importHolidayText() {
    const parsed = parseHolidayTextToMap(holidayText, daysInMonth);

    if (Object.keys(parsed).length === 0) {
      setMessage("匯入失敗：沒有讀到休假資料。");
      return;
    }

    setHolidayMap(parsed);
    setPeopleText(uniqueArray([...people, ...Object.keys(parsed)]).join("\n"));
    setIsHolidayGridReady(true);
    setMessage(`匯入成功：${Object.keys(parsed).length} 位人員，已建立休假表。`);
  }

  async function importGoogleSheet() {
    try {
      setMessage("Google Sheets 讀取中...");

      const csvUrl = googleSheetUrlToCsvUrl(googleUrl);
      const response = await fetch(csvUrl);

      if (!response.ok) {
        throw new Error("讀取失敗，請確認 Google Sheets 已設定為知道連結的使用者可查看");
      }

      const csvText = await response.text();
      const rows = parseCsv(csvText);
      const importedMap = parseGoogleSheetHolidayRows(rows, daysInMonth);

      if (Object.keys(importedMap).length === 0) {
        throw new Error("沒有讀到任何休假資料，請確認休假格子有填 1");
      }

      const filteredMap = {};

      people.forEach((person) => {
        const currentName = normalizeName(person);

        Object.entries(importedMap).forEach(([sheetName, days]) => {
          if (normalizeName(sheetName) === currentName) {
            filteredMap[person] = days;
          }
        });
      });

      if (Object.keys(filteredMap).length === 0) {
        throw new Error("Google Sheets 有資料，但沒有任何人名符合目前的人員名單。請確認姓名完全一致。");
      }

      setHolidayMap(filteredMap);
      setHolidayText(mapToHolidayText(filteredMap));
      setIsHolidayGridReady(true);

      const total = Object.values(filteredMap).reduce((sum, days) => sum + days.length, 0);
      setMessage(`Google Sheets 匯入成功：只匯入人員名單內 ${Object.keys(filteredMap).length} 位人員，共 ${total} 筆休假。`);
    } catch (error) {
      setMessage(`Google Sheets 匯入失敗：${error.message}`);
    }
  }

  function buildEmptyHolidayGrid() {
    const next = {};
    people.forEach((p) => {
      next[p] = holidayMap[p] || [];
    });

    setHolidayMap(next);
    setHolidayText(mapToHolidayText(next));
    setIsHolidayGridReady(true);
    setMessage("已建立可勾選休假表。");
  }

  function clearHolidays() {
    setHolidayMap({});
    setHolidayText("");
    setIsHolidayGridReady(false);
    setMessage("休假表已清除。");
  }

  function toggleHoliday(person, day) {
    if (isLocked) {
      setMessage("班表已鎖定，請先解除鎖定。");
      return;
    }

    setHolidayMap((prev) => {
      const current = prev[person] || [];
      const exists = current.includes(day);
      const nextDays = exists
        ? current.filter((d) => d !== day)
        : uniqueArray([...current, day]).sort((a, b) => a - b);

      const next = { ...prev, [person]: nextDays };
      setHolidayText(mapToHolidayText(next));
      return next;
    });
  }

  function generateSchedule() {
    if (isLocked) {
      setMessage("班表已鎖定，請先解除鎖定再重新產生。");
      return;
    }

    if (people.length === 0 || platforms.length === 0) {
      setMessage("請先設定人員與崗位。");
      return;
    }

    const dailyWarnings = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const count = countDailyHolidays(holidayMap, day);
      if (count < minDailyHoliday || count > maxDailyHoliday) {
        dailyWarnings.push(`${day}號休${count}人`);
      }
    }

    const result = generateAutoSchedule({ people, platforms, holidayMap, year, month });
    setSchedule(result);

    if (dailyWarnings.length > 0) {
      setMessage(`已產生班表，但每日休假人數有異常：${dailyWarnings.slice(0, 8).join("、")}${dailyWarnings.length > 8 ? "..." : ""}`);
    } else {
      setMessage("班表已產生，休假人數符合設定範圍。排班已分散崗位並套用連續限制。");
    }
  }

  function setManualTemporaryHoliday() {
    if (!manualDay || !manualPerson) {
      setMessage("請先選擇日期與人員。");
      return;
    }

    const day = Number(manualDay);
    toggleHoliday(manualPerson, day);
    setMessage(`已調整臨時休假：${manualPerson} ${day}號。`);
  }

  function applyManualShift() {
    if (!manualDay || !manualPerson || !manualPlatform) {
      setMessage("請選擇日期、人員與崗位。");
      return;
    }

    if (isLocked) {
      setMessage("班表已鎖定，請先解除鎖定。");
      return;
    }

    const day = Number(manualDay);

    setSchedule((prev) =>
      prev.map((row) => {
        if (row.day !== day) return row;
        return {
          ...row,
          assignments: { ...row.assignments, [manualPerson]: manualPlatform },
        };
      })
    );

    setMessage(`已調整：${manualPerson} ${day}號改為 ${manualPlatform}`);
  }

  function undoAllTemporaryHoliday() {
    setMessage("已取消臨時休假提醒；如需取消特定休假，請在休假表格點選該日期。");
  }

  function exportExcel() {
    if (schedule.length === 0) {
      setMessage("尚未產生班表，無法匯出。");
      return;
    }

    const csv = buildExcelCsv(schedule, people, year, month);
    downloadTextFile(`排班表-${year}-${pad2(month)}.csv`, csv, "text/csv;charset=utf-8");
    setMessage("已匯出 Excel 可開啟檔。");
  }

  function printPdf() {
    window.print();
  }

  function saveJson() {
    const data = {
      yearMonth,
      minDailyHoliday,
      maxDailyHoliday,
      peopleText,
      platformText,
      holidayText,
      holidayMap,
      schedule,
      isLocked,
    };

    downloadTextFile(
      `排班設定-${year}-${pad2(month)}.json`,
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8"
    );

    setMessage("已存檔 JSON。");
  }

  function loadJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (data.yearMonth) setYearMonth(data.yearMonth);
        if (typeof data.minDailyHoliday === "number") setMinDailyHoliday(data.minDailyHoliday);
        if (typeof data.maxDailyHoliday === "number") setMaxDailyHoliday(data.maxDailyHoliday);
        if (data.peopleText) setPeopleText(data.peopleText);
        if (data.platformText) setPlatformText(data.platformText);
        if (data.holidayText) setHolidayText(data.holidayText);
        if (data.holidayMap) setHolidayMap(data.holidayMap);
        if (Array.isArray(data.schedule)) setSchedule(data.schedule);
        if (typeof data.isLocked === "boolean") setIsLocked(data.isLocked);

        setIsHolidayGridReady(true);
        setMessage("JSON 載入成功。");
      } catch {
        setMessage("JSON 載入失敗，請確認檔案格式。");
      }
    };

    reader.readAsText(file);
    event.target.value = "";
  }

  function loadLastBackup() {
    const saved = safeJsonParse(localStorage.getItem("schedule_result"), []);
    if (saved.length > 0) {
      setSchedule(saved);
      setMessage("已載入最後備份。");
    } else {
      setMessage("目前沒有可載入的備份。");
    }
  }

  const holidaySummary = useMemo(() => {
    return Object.entries(holidayMap).map(([person, days]) => ({
      person,
      days: [...days].sort((a, b) => a - b),
    }));
  }, [holidayMap]);

  const platformStats = useMemo(() => {
    const stats = {};

    people.forEach((person) => {
      stats[person] = {
        totalWork: 0,
        totalRest: 0,
        high: 0,
        middle: 0,
        low: 0,
        platformCounts: {},
      };

      platforms.forEach((platform) => {
        stats[person].platformCounts[platform] = 0;
      });
    });

    schedule.forEach((row) => {
      people.forEach((person) => {
        const value = row.assignments?.[person] || "";

        if (!stats[person]) return;

        if (value === "休") {
          stats[person].totalRest += 1;
          return;
        }

        if (!value) return;

        stats[person].totalWork += 1;

        if (!stats[person].platformCounts[value]) {
          stats[person].platformCounts[value] = 0;
        }

        stats[person].platformCounts[value] += 1;

        const workload = getWorkload(value);
        if (workload === "高") stats[person].high += 1;
        else if (workload === "中") stats[person].middle += 1;
        else stats[person].low += 1;
      });
    });

    return stats;
  }, [schedule, people, platforms]);

  const platformStatColumns = useMemo(() => {
    const used = new Set(platforms);

    schedule.forEach((row) => {
      people.forEach((person) => {
        const value = row.assignments?.[person];
        if (value && value !== "休") used.add(value);
      });
    });

    return Array.from(used);
  }, [schedule, people, platforms]);

  return (
    <div className="app">
      <style>{`
        :root {
          --bg: #eaf2fb;
          --page: #f6f9fe;
          --card: #ffffff;
          --line: #cfe0f5;
          --line-2: #d7e1ef;
          --text: #16233a;
          --muted: #2f4566;
          --blue-900: #15386f;
          --blue-700: #245ed6;
          --blue-500: #3b82f6;
          --green: #07966a;
          --red: #dc2626;
          --shadow: 0 8px 22px rgba(27, 67, 125, 0.08);
        }

        * { box-sizing: border-box; }

        html,
        body,
        #root {
          width: 100% !important;
          max-width: none !important;
          min-height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        body {
          font-family: Arial, "Microsoft JhengHei", "Noto Sans TC", sans-serif;
          background: var(--bg);
          color: #10213d;
          font-size: 13.5px;
          font-weight: 500;
          overflow-x: hidden;
        }

        .app {
          width: 100%;
          min-height: 100vh;
          text-align: left;
          background:
            radial-gradient(circle at 5% 0%, rgba(59, 130, 246, 0.12), transparent 26%),
            linear-gradient(180deg, #eaf2fb 0%, #f8fbff 100%);
        }

        .hero {
          width: 100%;
          min-height: 56px;
          background: linear-gradient(135deg, var(--blue-900), var(--blue-700));
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 11px 18px;
          box-shadow: 0 6px 18px rgba(20, 53, 107, 0.18);
          position: sticky;
          top: 0;
          z-index: 30;
        }

        .hero h1 {
          margin: 0;
          font-size: 24px;
          line-height: 1.2;
          letter-spacing: 1.2px;
          font-weight: 900;
          text-align: center;
        }

        .hero p { display: none !important; }

        .container {
          width: min(2260px, calc(100vw - 32px));
          max-width: none;
          margin: 0 auto;
          padding: 14px 0 18px;
        }

        .grid {
          display: grid;
          grid-template-columns: minmax(520px, 0.92fr) minmax(600px, 1.08fr);
          gap: 12px;
          align-items: start;
        }

        .card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 11px;
          box-shadow: var(--shadow);
          align-self: start;
          min-width: 0;
        }

        .card.full { grid-column: 1 / -1; }

        .card h2 {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0 0 9px;
          font-size: 16px;
          line-height: 1.25;
          color: #10264b;
          font-weight: 900;
        }

        .bar {
          width: 4px;
          height: 18px;
          background: var(--blue-500);
          border-radius: 99px;
          display: inline-block;
          flex: 0 0 auto;
        }

        .badge {
          background: #e8f0ff;
          color: #2356bd;
          font-size: 11px;
          border-radius: 999px;
          padding: 3px 7px;
          margin-left: 2px;
          font-weight: 800;
        }

        label {
          display: block;
          font-size: 12px;
          font-weight: 800;
          color: #10264b;
          margin-bottom: 4px;
          letter-spacing: .2px;
        }

        input,
        textarea,
        select {
          border: 1px solid #bdd2ee;
          background: #fbfdff;
          border-radius: 9px;
          padding: 7px 9px;
          font-size: 13.5px;
          color: #10213d;
          font-weight: 600;
          outline: none;
          min-height: 32px;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: var(--blue-500);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
        }

        textarea {
          width: 100%;
          min-height: 74px;
          resize: vertical;
          line-height: 1.42;
        }

        .card:first-child textarea {
          min-height: 92px;
        }

        .card:first-child textarea:nth-of-type(2) {
          min-height: 84px;
        }

        .card:nth-child(2) textarea:first-of-type {
          min-height: 70px;
        }

        .row {
          display: flex;
          gap: 7px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field input[type="month"] { width: 138px; }
        .field input[type="number"] { width: 76px !important; }

        .hint {
          font-size: 11.5px;
          color: #2f4566;
          font-weight: 650;
          line-height: 1.42;
          margin: 4px 0 7px;
        }

        .notice {
          padding: 7px 9px;
          border-radius: 10px;
          border: 1px solid #c3d7f2;
          background: #f7fbff;
          color: #1e3658;
          font-size: 12.5px;
          font-weight: 700;
          line-height: 1.42;
          margin-top: 7px;
        }

        .status {
          padding: 8px 10px;
          border-radius: 10px;
          background: #eefcf5;
          color: #0f7a50;
          border: 1px solid #bcebd4;
          margin-top: 8px;
          font-size: 13px;
          font-weight: 900;
          text-align: center;
        }

        button,
        .fileButton {
          border: 1px solid rgba(25, 65, 120, 0.08);
          border-radius: 10px;
          padding: 7px 11px;
          cursor: pointer;
          font-weight: 800;
          font-size: 12.5px;
          background: #e8eef7;
          color: #22344f;
          box-shadow: 0 3px 10px rgba(25, 65, 120, 0.08);
          transition: transform .12s, box-shadow .12s, filter .12s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          white-space: nowrap;
        }

        button:hover,
        .fileButton:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(25, 65, 120, 0.14);
          filter: brightness(1.02);
        }

        .primary { background: linear-gradient(135deg, #0aa06e, #08825a); color: white; }
        .blue { background: linear-gradient(135deg, #3978ff, #255bd7); color: white; }
        .dark { background: #17243c; color: white; }
        .red { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
        .yellow { background: #fff4c2; color: #765100; }

        .googleBox {
          border: 1px solid #c9d9ee;
          background: linear-gradient(180deg, #f9fcff, #f4f8fe);
          border-radius: 12px;
          padding: 8px;
          margin-top: 8px;
        }

        .googleBox label {
          text-align: center;
          margin-bottom: 5px;
        }

        .googleBox textarea {
          min-height: 42px;
          height: 42px;
          font-size: 12.5px;
          color: #10213d;
          font-weight: 650;
          line-height: 1.35;
        }

        .googleBox .hint {
          margin: 5px 0 7px;
          font-size: 11.2px;
          color: #2a4160;
          font-weight: 700;
          text-align: center;
        }

        .googleBox .blue {
          display: flex;
          margin: 0 auto;
        }

        .holidaySummary {
          border: 1px solid #d3e2f6;
          border-radius: 12px;
          overflow: auto;
          margin-top: 8px;
          max-height: 210px;
          background: white;
        }

        .holidaySummary table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
          color: #10213d;
          font-weight: 650;
        }

        .holidaySummary th,
        .holidaySummary td {
          border-bottom: 1px solid #e4edf8;
          padding: 5px 8px;
          text-align: left;
          vertical-align: top;
        }

        .holidaySummary th {
          background: #e7f0fb;
          color: #0f2749;
          position: sticky;
          top: 0;
          z-index: 1;
          font-weight: 900;
        }

        .holidayGridWrap,
        .scheduleWrap,
        .platformStatsWrap {
          overflow: auto;
          border: 1px solid #c9d9ee;
          border-radius: 12px;
          margin-top: 9px;
          background: white;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .65);
        }

        .holidayGridWrap { max-height: 430px; }
        .scheduleWrap { max-height: 720px; }
        .platformStatsWrap { max-height: 500px; }

        .holidayGrid,
        .scheduleTable,
        .platformStatsTable {
          border-collapse: collapse;
          min-width: 1120px;
          width: 100%;
          font-size: 12px;
          background: white;
          color: #10213d;
          font-weight: 650;
        }

        .scheduleTable {
          min-width: 1450px;
        }

        .platformStatsTable {
          min-width: 1280px;
        }

        .holidayGrid th,
        .holidayGrid td,
        .scheduleTable th,
        .scheduleTable td,
        .platformStatsTable th,
        .platformStatsTable td {
          border: 1px solid var(--line-2);
          text-align: center;
          padding: 4px 6px;
          white-space: nowrap;
          line-height: 1.25;
        }

        .scheduleTable td {
          padding: 5px 7px;
        }

        .holidayGrid th,
        .scheduleTable th,
        .platformStatsTable th {
          background: linear-gradient(180deg, #eef5ff, #e3efff);
          color: #10264b;
          font-weight: 900;
          position: sticky;
          top: 0;
          z-index: 4;
        }

        .scheduleTable tbody tr:nth-child(even) td,
        .platformStatsTable tbody tr:nth-child(even) td,
        .holidayGrid tbody tr:nth-child(even) td {
          filter: brightness(.99);
        }

        .scheduleTable tbody tr:hover td,
        .platformStatsTable tbody tr:hover td,
        .holidayGrid tbody tr:hover td {
          outline: 1px solid rgba(59, 130, 246, .28);
          outline-offset: -1px;
        }

        .nameCell,
        .scheduleTable .dateCol {
          position: sticky;
          left: 0;
          background: #f7fbff !important;
          z-index: 5;
          font-weight: 900;
          min-width: 78px;
          color: #10264b;
          box-shadow: 2px 0 0 rgba(207,224,245,.85);
        }

        .platformStatsTable .nameCell { min-width: 86px; }

        .platformStatsTable .summaryCol {
          background: #f2f7ff !important;
          font-weight: 900;
          color: #173a72;
          min-width: 46px;
        }

        .platformStatsTable th.summaryCol { background: #dfeeff !important; }
        .platformStatsTable .zeroCell { color: #b6c0d1; background: #fbfdff; }
        .platformStatsTable .countCell { font-weight: 900; color: #173a72; background: #f7fbff; }

        .holidayCell {
          cursor: pointer;
          min-width: 26px;
          height: 24px;
          transition: background .12s;
        }

        .holidayCell:hover { background: #eaf2ff; }
        .holidayCell.on { background: #ffd7d7; color: #c01818; font-weight: 900; }
        .holidayCell.weekend { background: #fff7f7; }
        .holidayCell.on.weekend { background: #ffbfc0; }

        .workHigh { background: #ffdede; }
        .workMiddle { background: #fff3bf; }
        .workLow { background: #dff0ff; }
        .rest { background: #ffb3b3; color: #a40000; font-weight: 900; }
        .weekendText { color: #d60000; font-weight: 900; }

        .stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(120px, 1fr));
          gap: 8px;
          margin-top: 8px;
        }

        .stat {
          background: linear-gradient(180deg, #f7fbff, #f1f6fd);
          border: 1px solid #d5e4f8;
          border-radius: 12px;
          padding: 8px 10px;
          font-size: 12px;
          text-align: center;
          color: #45617f;
          font-weight: 800;
        }

        .stat strong {
          display: block;
          color: #173a72;
          font-size: 18px;
          margin-top: 2px;
        }

        input[type="file"] { display: none; }

        .printArea h2[style] { margin-top: 12px !important; }

        @media (min-width: 1300px) {
          .card:nth-child(1),
          .card:nth-child(2) {
            min-height: 0;
          }
        }

        @media (max-width: 1180px) {
          .container {
            width: calc(100vw - 20px);
            padding: 10px 0 14px;
          }

          .grid { grid-template-columns: 1fr; }
          .hero { min-height: 50px; padding: 10px 14px; }
          .hero h1 { font-size: 21px; }
          .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
        }

        @media print {
          .hero,
          .card:not(.printArea),
          button,
          .fileButton,
          input,
          textarea,
          select {
            display: none !important;
          }

          .container { padding: 0; width: 100%; }
          .card.printArea { display: block; border: none; box-shadow: none; }
          .scheduleWrap { max-height: none; overflow: visible; border: none; }
        }
      `}</style>

      <header className="hero">
        <h1>智能排休排班管理系統</h1>
        
      </header>

      <main className="container">
        <div className="grid">
          <section className="card">
            <h2><span className="bar" />1. 基本設定</h2>

            <div className="row">
              <div className="field">
                <label>月份</label>
                <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
              </div>

              <div className="field">
                <label>每日休假範圍</label>
                <div className="row" style={{ marginBottom: 0 }}>
                  <input type="number" min="0" style={{ width: 80 }} value={minDailyHoliday} onChange={(e) => setMinDailyHoliday(Number(e.target.value))} />
                  <span className="hint">至少休</span>
                  <input type="number" min="0" style={{ width: 80 }} value={maxDailyHoliday} onChange={(e) => setMaxDailyHoliday(Number(e.target.value))} />
                  <span className="hint">最多休</span>
                </div>
              </div>
            </div>

            <div className="hint">人員與崗位一行一個。Google Sheets 匯入時，只會讀取這份人員名單內的人。</div>

            <label>人員名單</label>
            <textarea value={peopleText} onChange={(e) => setPeopleText(e.target.value)} />

            <label style={{ marginTop: 12 }}>崗位名稱</label>
            <textarea value={platformText} onChange={(e) => setPlatformText(e.target.value)} />

            <div className="row">
              <button className="blue" onClick={buildEmptyHolidayGrid}>建立休假表</button>
              <button onClick={() => setMessage("設定已暫存在瀏覽器 localStorage。")}>儲存設定</button>
              <button onClick={loadLastBackup}>載入設定</button>
            </div>
          </section>

          <section className="card">
            <h2><span className="bar" />2. 休假表<span className="badge">排休制</span></h2>

            <div className="hint">可直接貼上「每人休假日期」格式。例：大抠：2,7,12,16。也支援 1-3 區間寫法。</div>

            <label>貼上排休名單</label>
            <textarea value={holidayText} onChange={(e) => setHolidayText(e.target.value)} />

            <div className="row">
              <button className="primary" onClick={importHolidayText}>匯入休假名單</button>
              <button onClick={buildEmptyHolidayGrid}>建立可勾選休假表</button>
              <button onClick={clearHolidays}>清除休假表</button>
            </div>

            <div className="googleBox">
              <label>Google Sheets 連結</label>
              <textarea rows={2} value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="貼上 Google Sheets 連結" />
              <div className="hint">
                請先將 Google Sheets 設為「知道連結的使用者可查看」。系統會讀取日期 1～31 欄位，格子填 1 即為休假；只會匯入左側「人員名單」內存在的人。
              </div>
              <button className="blue" onClick={importGoogleSheet}>讀取 Google Sheets 休假表</button>
            </div>

            {holidaySummary.length === 0 ? (
              <div className="notice">尚未建立休假表。</div>
            ) : (
              <div className="holidaySummary">
                <table>
                  <thead>
                    <tr><th>人員</th><th>休假日期</th><th>天數</th></tr>
                  </thead>
                  <tbody>
                    {holidaySummary.map((item) => (
                      <tr key={item.person}>
                        <td>{item.person}</td>
                        <td>{item.days.join(", ")}</td>
                        <td>{item.days.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card full">
            <h2><span className="bar" />3. 產生與調整班表</h2>

            <div className="row">
              <button className="primary" onClick={generateSchedule}>產生 / 重新隨機排班</button>
              <button className="dark" onClick={exportExcel}>匯出 Excel 可開啟檔</button>
              <button onClick={printPdf}>列印 / 另存 PDF</button>
              <button className={isLocked ? "yellow" : "red"} onClick={() => setIsLocked(!isLocked)}>{isLocked ? "🔓 解除鎖定" : "🔒 鎖定班表"}</button>
              <button className="dark" onClick={saveJson}>💾 存檔 JSON</button>

              <label className="fileButton">
                📂 載入 JSON
                <input type="file" accept=".json,application/json" onChange={loadJson} />
              </label>

              <button onClick={loadLastBackup}>載入最後備份</button>
            </div>

            <div className="notice">臨時休假欄位：選日期、選人、選崗位。只修改當天；其他日期不會重新平均。</div>

            <div className="row">
              <select value={manualDay} onChange={(e) => setManualDay(e.target.value)}>
                <option value="">選日期</option>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => <option key={day} value={day}>{day}號</option>)}
              </select>

              <select value={manualPerson} onChange={(e) => setManualPerson(e.target.value)}>
                <option value="">選人</option>
                {people.map((person) => <option key={person} value={person}>{person}</option>)}
              </select>

              <select value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value)}>
                <option value="">選崗位</option>
                {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
              </select>

              <button className="red" onClick={setManualTemporaryHoliday}>套用臨時休假</button>
              <button onClick={applyManualShift}>套用崗位調整</button>
              <button className="dark" onClick={undoAllTemporaryHoliday}>取消全部臨時休假</button>
            </div>

            <div className="status">{message}</div>
          </section>

          <section className="card full">
            <h2><span className="bar" />4. 可勾選休假表</h2>

            {!isHolidayGridReady && holidaySummary.length === 0 ? (
              <div className="notice">尚未建立可勾選休假表。請先匯入休假名單、讀取 Google Sheets，或點「建立可勾選休假表」。</div>
            ) : (
              <div className="holidayGridWrap">
                <table className="holidayGrid">
                  <thead>
                    <tr>
                      <th className="nameCell">人員</th>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                        <th key={day} className={isWeekend(year, month, day) ? "weekendText" : ""}>
                          <div>{day}</div><div>{getWeekday(year, month, day)}</div>
                        </th>
                      ))}
                      <th>天數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => {
                      const days = holidayMap[person] || [];
                      return (
                        <tr key={person}>
                          <td className="nameCell">{person}</td>
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                            const on = days.includes(day);
                            const weekend = isWeekend(year, month, day);
                            return (
                              <td key={day} onClick={() => toggleHoliday(person, day)} className={`holidayCell ${on ? "on" : ""} ${weekend ? "weekend" : ""}`} title={`${person} ${day}號`}>
                                {on ? "1" : ""}
                              </td>
                            );
                          })}
                          <td>{days.length}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="nameCell">每日休假數</td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                        const count = countDailyHolidays(holidayMap, day);
                        const bad = count < minDailyHoliday || count > maxDailyHoliday;
                        return <td key={day} style={{ color: bad ? "red" : "#0f7a50", fontWeight: 800 }}>{count}</td>;
                      })}
                      <td>-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card full printArea">
            <h2><span className="bar" />5. 排班結果</h2>

            {schedule.length === 0 ? (
              <div className="notice">尚未產生班表。</div>
            ) : (
              <>
                <div className="stats">
                  <div className="stat">人員數<strong>{people.length}</strong></div>
                  <div className="stat">崗位數<strong>{platforms.length}</strong></div>
                  <div className="stat">月份天數<strong>{daysInMonth}</strong></div>
                  <div className="stat">鎖定狀態<strong>{isLocked ? "已鎖定" : "未鎖定"}</strong></div>
                </div>

                <div className="scheduleWrap">
                  <table className="scheduleTable">
                    <thead>
                      <tr>
                        <th className="dateCol">日期</th>
                        {people.map((person) => <th key={person}>{person}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((row) => (
                        <tr key={row.day}>
                          <td className="dateCol">
                            <span className={isWeekend(year, month, row.day) ? "weekendText" : ""}>{month}/{row.day}（{row.weekday}）</span>
                          </td>

                          {people.map((person) => {
                            const value = row.assignments[person] || "";
                            const workload = getWorkload(value);
                            const cls = value === "休" ? "rest" : workload === "高" ? "workHigh" : workload === "中" ? "workMiddle" : "workLow";
                            return <td key={person} className={cls}>{value}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2 style={{ marginTop: 18 }}><span className="bar" />6. 個人崗位次數統計</h2>
              

                <div className="platformStatsWrap">
                  <table className="platformStatsTable">
                    <thead>
                      <tr>
                        <th className="nameCell">人員</th>
                        <th className="summaryCol">上班</th>
                        <th className="summaryCol">休假</th>
                        <th className="summaryCol">高</th>
                        <th className="summaryCol">中</th>
                        <th className="summaryCol">低</th>
                        {platformStatColumns.map((platform) => (
                          <th key={platform}>{platform}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((person) => {
                        const row = platformStats[person] || {
                          totalWork: 0,
                          totalRest: 0,
                          high: 0,
                          middle: 0,
                          low: 0,
                          platformCounts: {},
                        };

                        return (
                          <tr key={person}>
                            <td className="nameCell">{person}</td>
                            <td className="summaryCol">{row.totalWork}</td>
                            <td className="summaryCol">{row.totalRest}</td>
                            <td className="summaryCol">{row.high}</td>
                            <td className="summaryCol">{row.middle}</td>
                            <td className="summaryCol">{row.low}</td>
                            {platformStatColumns.map((platform) => {
                              const count = row.platformCounts?.[platform] || 0;

                              return (
                                <td
                                  key={`${person}-${platform}`}
                                  className={count === 0 ? "zeroCell" : "countCell"}
                                >
                                  {count}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
