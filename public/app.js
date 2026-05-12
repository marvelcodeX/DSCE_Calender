const { useState } = React;

function App() {
  const [semesterStart, setSemesterStart] = useState("");
  const [semesterEnd, setSemesterEnd] = useState("");
  const [semesterNumber, setSemesterNumber] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  const [calendar, setCalendar] = useState([]);
  const [bannerTitle, setBannerTitle] = useState("");

  const [ciaRows, setCiaRows] = useState([
    { name: "IAT – I", start: "", end: "", starLevel: 1 },
    { name: "IAT – II", start: "", end: "", starLevel: 2 },
    { name: "IAT – III", start: "", end: "", starLevel: 3 }
  ]);

  const [labRows, setLabRows] = useState([
    { name: "LAB", start: "", end: "", starLevel: 1 }
  ]);

  const [eventRows, setEventRows] = useState([
    { name: "Semester Opening", start: "", end: "", starLevel: 0 }
  ]);

  const [holidays, setHolidays] = useState([]);
  const [removedHolidayIds, setRemovedHolidayIds] = useState([]);

  function handleCiaChange(index, field, value) {
    const updated = [...ciaRows];
    updated[index][field] = value;
    setCiaRows(updated);
  }

  function handleLabChange(index, field, value) {
    const updated = [...labRows];
    updated[index][field] = value;
    setLabRows(updated);
  }

  function handleEventChange(index, field, value) {
    const updated = [...eventRows];
    updated[index][field] = value;
    setEventRows(updated);
  }

  function addEventRow() {
    setEventRows([
      ...eventRows,
      { name: "", start: "", end: "", starLevel: 0 }
    ]);
  }

  function dedupeHolidays(list) {
    const map = new Map();

    list.forEach((h) => {
      const key = `${h.id || h.date}-${h.name}`;
      if (!map.has(key)) {
        map.set(key, h);
      }
    });

    return Array.from(map.values());
  }

  function getOrdinalSuffix(num) {
    const n = Number(num);
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return `${n}th`;
  }

  function buildBannerTitle(sem, year) {
    if (!sem || !year) return "";
    return `UG - CALENDAR OF EVENTS FOR ${getOrdinalSuffix(sem)} SEM ${year}`;
  }

  async function fetchCalendar(updatedRemovedHolidayIds = removedHolidayIds) {
    const labAsEvents = labRows
      .filter((lab) => lab.name && lab.start && lab.end)
      .map((lab) => ({
        name: lab.name,
        start: lab.start,
        end: lab.end,
        starLevel: lab.starLevel
      }));

    const payload = {
      semesterStart,
      semesterEnd,
      semesterNumber,
      academicYear,
      cias: ciaRows.filter((c) => c.start && c.end),
      events: [
        ...eventRows.filter((e) => e.name && e.start && e.end),
        ...labAsEvents
      ],
      removedHolidayIds: updatedRemovedHolidayIds
    };

    const res = await fetch("http://localhost:3000/api/calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to generate calendar");
    }

    setBannerTitle(
      data.bannerTitle || buildBannerTitle(semesterNumber, academicYear)
    );
    setCalendar(data.calendar || []);

    const filtered = (data.holidays || []).filter(
      (h) => !updatedRemovedHolidayIds.includes(h.id)
    );

    setHolidays(dedupeHolidays(filtered));
  }

  async function handleRemoveHoliday(id) {
    const updatedIds = removedHolidayIds.includes(id)
      ? removedHolidayIds
      : [...removedHolidayIds, id];

    setRemovedHolidayIds(updatedIds);
    setHolidays((prev) => prev.filter((h) => h.id !== id));

    try {
      await fetchCalendar(updatedIds);
    } catch (err) {
      console.error(err);
      alert("Error updating calendar after deleting holiday");
    }
  }

  function renderDayCell(day) {
    if (!day) return "";

    return (
      <div className={`day-cell ${day.isHoliday ? "holiday" : ""} ${day.isCia ? "exam" : ""}`}>
        {day.date}
        {day.starLevel > 0 && (
          <span className="star">
            {"*".repeat(day.starLevel)}
          </span>
        )}
      </div>
    );
  }

  async function generateCalendarRequest(e) {
    e.preventDefault();

    try {
      await fetchCalendar();
    } catch (err) {
      console.error(err);
      alert(err.message || "Error generating calendar");
    }
  }

  return (
    <>
      <header className="app-header">
        <img src="dsce-banner.png" className="banner-image" alt="DSCE Banner" />
        <p className="header-subtitle">Academic Calendar Generator</p>
      </header>

      <main className="main-container">
        <form onSubmit={generateCalendarRequest} className="card">
          <h3 className="card-title">Duration</h3>

          <div className="form-grid">
            <input
              type="date"
              className="form-input"
              value={semesterStart}
              onChange={(e) => setSemesterStart(e.target.value)}
              required
            />

            <input
              type="date"
              className="form-input"
              value={semesterEnd}
              onChange={(e) => setSemesterEnd(e.target.value)}
              required
            />
          </div>

          <div className="form-grid">
            <select
              className="form-input"
              value={semesterNumber}
              onChange={(e) => setSemesterNumber(e.target.value)}
              required
            >
              <option value="">Select Semester</option>
              <option value="1">1st Sem</option>
              <option value="2">2nd Sem</option>
              <option value="3">3rd Sem</option>
              <option value="4">4th Sem</option>
              <option value="5">5th Sem</option>
              <option value="6">6th Sem</option>
              <option value="7">7th Sem</option>
              <option value="8">8th Sem</option>
            </select>

            <input
              type="text"
              className="form-input"
              placeholder="Academic Year (e.g. 2025-26)"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              required
            />
          </div>

          <h3 className="card-title">CIA / IAT Schedule</h3>

          {ciaRows.map((cia, i) => (
            <div className="form-grid" key={i}>
              <input
                className="form-input"
                value={cia.name}
                onChange={(e) => handleCiaChange(i, "name", e.target.value)}
              />

              <input
                type="date"
                className="form-input"
                value={cia.start}
                onChange={(e) => handleCiaChange(i, "start", e.target.value)}
              />

              <input
                type="date"
                className="form-input"
                value={cia.end}
                onChange={(e) => handleCiaChange(i, "end", e.target.value)}
              />

              <select
                className="form-input"
                value={cia.starLevel}
                onChange={(e) => handleCiaChange(i, "starLevel", Number(e.target.value))}
              >
                <option value={1}>1 *</option>
                <option value={2}>2 *</option>
                <option value={3}>3 *</option>
              </select>
            </div>
          ))}

          <h3 className="card-title">Lab Schedule</h3>

          {labRows.map((lab, i) => (
            <div className="form-grid" key={i}>
              <input
                className="form-input"
                value={lab.name}
                onChange={(e) => handleLabChange(i, "name", e.target.value)}
              />

              <input
                type="date"
                className="form-input"
                value={lab.start}
                onChange={(e) => handleLabChange(i, "start", e.target.value)}
              />

              <input
                type="date"
                className="form-input"
                value={lab.end}
                onChange={(e) => handleLabChange(i, "end", e.target.value)}
              />

              <select
                className="form-input"
                value={lab.starLevel}
                onChange={(e) => handleLabChange(i, "starLevel", Number(e.target.value))}
              >
                <option value={1}>1 *</option>
                <option value={2}>2 *</option>
                <option value={3}>3 *</option>
              </select>
            </div>
          ))}

          <h3 className="card-title">Custom Events / Holidays</h3>

          {eventRows.map((event, i) => (
            <div className="form-grid" key={i}>
              <input
                className="form-input"
                value={event.name}
                onChange={(e) => handleEventChange(i, "name", e.target.value)}
              />

              <input
                type="date"
                className="form-input"
                value={event.start}
                onChange={(e) => handleEventChange(i, "start", e.target.value)}
              />

              <input
                type="date"
                className="form-input"
                value={event.end}
                onChange={(e) => handleEventChange(i, "end", e.target.value)}
              />

              <select
                className="form-input"
                value={event.starLevel}
                onChange={(e) => handleEventChange(i, "starLevel", Number(e.target.value))}
              >
                <option value={0}>Holiday</option>
                <option value={1}>1 *</option>
                <option value={2}>2 *</option>
                <option value={3}>3 *</option>
              </select>
            </div>
          ))}

          <div className="btn-group">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addEventRow}
            >
              Add Event
            </button>

            <button type="submit" className="btn btn-primary">
              Generate Calendar
            </button>
          </div>
        </form>

        {(bannerTitle || calendar.length > 0 || holidays.length > 0) && (
          <div className="results-layout">
            <div className="calendar-section card">
              <img
                src="dsce-calendar-banner.png"
                className="calendar-banner-image"
                alt="Calendar Banner"
              />

              {bannerTitle && (
                <h2 className="calendar-banner-title">{bannerTitle}</h2>
              )}

              <h3 className="card-title">Generated Calendar</h3>

              <table className="calendar-table">
                <thead>
                  <tr>
                    <th>WEEK</th>
                    <th>MONTH</th>
                    <th>MON</th>
                    <th>TUE</th>
                    <th>WED</th>
                    <th>THU</th>
                    <th>FRI</th>
                    <th>SAT</th>
                    <th>WD</th>
                    <th>REMARKS</th>
                  </tr>
                </thead>

                <tbody>
                  {calendar.map((row, i) => (
                    <tr key={i}>
                      <td>{row.week}</td>
                      <td>{row.month}</td>
                      <td>{renderDayCell(row.mon)}</td>
                      <td>{renderDayCell(row.tue)}</td>
                      <td>{renderDayCell(row.wed)}</td>
                      <td>{renderDayCell(row.thu)}</td>
                      <td>{renderDayCell(row.fri)}</td>
                      <td>{renderDayCell(row.sat)}</td>
                      <td>{row.workingDays}</td>
                      <td>{row.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="holiday-section card">
              <h3 className="card-title">Google Holidays</h3>

              <ul className="holiday-list">
                {holidays.map((h) => (
                  <li key={`${h.id}-${h.name}`} className="holiday-item">
                    <span className="holiday-date">{h.date}</span>
                    <span className="holiday-name">{h.name}</span>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveHoliday(h.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);