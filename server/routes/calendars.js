const express = require("express");
const router = express.Router();
const { getHolidaysWithFallback } = require("../googleCalendar");

/*
POST /api/calendars
Generate calendar
*/
router.post("/", async (req, res) => {
  try {
    const {
      semesterStart,
      semesterEnd,
      semesterNumber = "",
      academicYear = "",
      cias = [],
      events = [],
      removedHolidayIds = []
    } = req.body;

    if (!semesterStart || !semesterEnd) {
      return res.status(400).json({
        success: false,
        error: "semesterStart and semesterEnd are required"
      });
    }

    if (!semesterNumber) {
      return res.status(400).json({
        success: false,
        error: "semesterNumber is required"
      });
    }

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: "academicYear is required"
      });
    }

    const normalizedSemesterNumber = String(semesterNumber).trim();

    if (!["1", "2", "3", "4", "5", "6", "7", "8"].includes(normalizedSemesterNumber)) {
      return res.status(400).json({
        success: false,
        error: "semesterNumber must be between 1 and 8"
      });
    }

    const semesterLabel = `${getOrdinalSuffix(normalizedSemesterNumber)} Semester`;
    const bannerTitle = `UG - CALENDAR OF EVENTS FOR ${getOrdinalSuffix(
      normalizedSemesterNumber
    )} SEM ${academicYear}`;

    const startDate = parseDateStringAsLocal(semesterStart);
    const endDate = parseDateStringAsLocal(semesterEnd);
    const startStr = semesterStart;
    const endStr = semesterEnd;
    const year = startDate.getFullYear();

    let googleHolidays = await getHolidaysWithFallback(year);

    googleHolidays = dedupeGoogleHolidays(googleHolidays);

    if (removedHolidayIds.length > 0) {
      googleHolidays = googleHolidays.filter(
        (h) => !removedHolidayIds.includes(h.start_date)
      );
    }

    googleHolidays = googleHolidays.filter((h) => {
      const holidayStart = h.start_date;
      const holidayEnd = h.end_date || h.start_date;
      return holidayStart <= endStr && holidayEnd >= startStr;
    });

    const holidays = googleHolidays.map((h) => ({
      id: h.start_date,
      date: h.start_date,
      name: h.holiday_name,
      start_date: h.start_date,
      end_date: h.end_date || h.start_date,
      starLevel: 0,
      type: "holiday"
    }));

    const saturdayHolidays = getFirstAndThirdSaturdays(startDate, endDate);

    const customEvents = events.map((e) => ({
      id: `event-${e.name}-${e.start}`,
      name: e.name,
      start_date: e.start,
      end_date: e.end || e.start,
      starLevel: e.starLevel || 0,
      type: Number(e.starLevel || 0) === 0 ? "holiday" : "event"
    }));

    const allEvents = [...holidays, ...saturdayHolidays, ...customEvents];

    const calendar = generateCalendarGrid(startDate, endDate, cias, allEvents);

    res.json({
      success: true,
      semesterNumber: normalizedSemesterNumber,
      semesterLabel,
      academicYear,
      bannerTitle,
      calendar,
      holidays
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: "Failed to generate calendar"
    });
  }
});

function getOrdinalSuffix(num) {
  const n = Number(num);

  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function parseDateStringAsLocal(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dedupeGoogleHolidays(holidays) {
  const map = new Map();

  holidays.forEach((h) => {
    const key = `${h.start_date}-${h.holiday_name}`;
    if (!map.has(key)) {
      map.set(key, h);
    }
  });

  return Array.from(map.values());
}

function getFirstAndThirdSaturdays(startDate, endDate) {
  const saturdayEvents = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const saturdays = [];

    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, month, day);
      if (d.getMonth() !== month) break;

      if (d.getDay() === 6 && d >= startDate && d <= endDate) {
        saturdays.push(new Date(d));
      }
    }

    if (saturdays[0]) {
      saturdayEvents.push({
        id: `sat-${formatLocalDate(saturdays[0])}`,
        name: "1st Saturday Holiday",
        start_date: formatLocalDate(saturdays[0]),
        end_date: formatLocalDate(saturdays[0]),
        starLevel: 0,
        type: "holiday"
      });
    }

    if (saturdays[2]) {
      saturdayEvents.push({
        id: `sat-${formatLocalDate(saturdays[2])}`,
        name: "3rd Saturday Holiday",
        start_date: formatLocalDate(saturdays[2]),
        end_date: formatLocalDate(saturdays[2]),
        starLevel: 0,
        type: "holiday"
      });
    }

    current.setMonth(current.getMonth() + 1);
    current.setDate(1);
  }

  return saturdayEvents;
}

function generateCalendarGrid(startDate, endDate, cias, events) {
  const calendar = [];
  let current = new Date(startDate);
  let week = 1;

  while (current <= endDate) {
    const weekStart = new Date(current);

    const days = {
      mon: buildDay(weekStart, 1, cias, events),
      tue: buildDay(weekStart, 2, cias, events),
      wed: buildDay(weekStart, 3, cias, events),
      thu: buildDay(weekStart, 4, cias, events),
      fri: buildDay(weekStart, 5, cias, events),
      sat: buildDay(weekStart, 6, cias, events)
    };

    let workingDays = 0;
    let remarks = [];

    Object.values(days).forEach((d) => {
      if (!d) return;

      if (!d.isHoliday && d.weekday <= 5) {
        workingDays++;
      }

      if (d.eventNames.length > 0) {
        remarks.push(`${d.date} - ${d.eventNames.join(", ")}`);
      }
    });

    calendar.push({
      week: week++,
      month: weekStart.toLocaleString("default", { month: "short" }),
      ...days,
      workingDays,
      remarks: remarks.join("; ")
    });

    current.setDate(current.getDate() + 7);
  }

  return calendar;
}

function buildDay(weekStart, weekday, cias, events) {
  const date = new Date(weekStart);
  const offset = weekday - date.getDay();
  date.setDate(date.getDate() + offset);

  if (date.getDay() === 0) return null;

  const dateStr = formatLocalDate(date);

  let starLevel = 0;
  let isHoliday = false;
  let isCia = false;
  let eventNames = [];

  cias.forEach((cia) => {
    if (!cia.start || !cia.end) return;

    const startStr = cia.start;
    const endStr = cia.end;

    if (dateStr >= startStr && dateStr <= endStr) {
      isCia = true;
      starLevel = Math.max(starLevel, cia.starLevel || 1);
      eventNames.push(cia.name);
    }
  });

  events.forEach((event) => {
    if (!event.start_date) return;

    const startStr = event.start_date;
    const endStr = event.end_date || event.start_date;

    if (dateStr >= startStr && dateStr <= endStr) {
      if (event.type === "holiday") {
        isHoliday = true;
      }

      starLevel = Math.max(starLevel, event.starLevel || 0);
      eventNames.push(event.name || event.holiday_name);
    }
  });

  return {
    date: date.getDate(),
    weekday,
    starLevel,
    isHoliday,
    isCia,
    eventNames
  };
}

module.exports = router;