const MINUTES_PER_DAY = 24 * 60;

document.addEventListener("DOMContentLoaded", () => {
  markCurrentPage();
  setYear();
  bindContactForm();
  initTimesheetCalculator();
  initWeeklyCalculator();
  initWorkHoursCalculator();
  initHoursBetweenCalculator();
  initOvertimeCalculator();
  initTimecardCalculator();
});

function markCurrentPage() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.getAttribute("href") === current) {
      link.setAttribute("aria-current", "page");
    }
  });
}

function setYear() {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });
}

function bindContactForm() {
  const form = document.getElementById("contact-form");
  const output = document.getElementById("contact-result");

  if (!form || !output) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.querySelector("[name='name']").value.trim();
    const email = form.querySelector("[name='email']").value.trim();
    const message = form.querySelector("[name='message']").value.trim();

    if (!name || !email || !message) {
      setMessage(output, "error", "Please complete your name, email, and message before sending.");
      return;
    }

    form.reset();
    setMessage(output, "success", "Thanks for your note. If you need a reply, please use the email address shown on this page.");
  });

  form.addEventListener("reset", () => {
    clearMessage(output);
  });
}

function timeToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function getShiftMinutes(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  let diff = endMinutes - startMinutes;
  const overnight = diff < 0;

  if (overnight) {
    diff += MINUTES_PER_DAY;
  }

  return {
    minutes: diff,
    overnight
  };
}

function formatMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDecimalHours(totalMinutes) {
  return (totalMinutes / 60).toFixed(2);
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function readNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDurationInput(value) {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.round(Number(raw) * 60);
  }

  const parts = raw.split(":");
  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  return null;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMessage(node, type, text) {
  node.className = `message ${type}`;
  node.textContent = text;
  node.hidden = false;
}

function clearMessage(node) {
  node.hidden = true;
  node.textContent = "";
  node.className = "message";
}

function updateSummary(root, pairs) {
  Object.entries(pairs).forEach(([key, value]) => {
    const target = root.querySelector(`[data-value='${key}']`);
    if (target) {
      target.textContent = value;
    }
  });
}

function initTimesheetCalculator() {
  const form = document.getElementById("timesheet-form");
  const result = document.getElementById("timesheet-result");
  const message = document.getElementById("timesheet-message");

  if (!form || !result || !message) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);

    const start = form.start.value;
    const end = form.end.value;
    const breakMinutes = Math.max(0, readNumber(form.breakMinutes.value));
    const rate = Math.max(0, readNumber(form.rate.value));
    const shift = getShiftMinutes(start, end);

    if (!shift) {
      setMessage(message, "error", "Enter both start and end times in a valid 24-hour format.");
      result.hidden = true;
      return;
    }

    if (breakMinutes > shift.minutes) {
      setMessage(message, "error", "Break minutes cannot be longer than the total shift.");
      result.hidden = true;
      return;
    }

    const netMinutes = shift.minutes - breakMinutes;
    updateSummary(result, {
      total: formatMinutes(netMinutes),
      decimal: `${formatDecimalHours(netMinutes)} hours`,
      break: formatMinutes(breakMinutes),
      pay: currency((netMinutes / 60) * rate)
    });

    setMessage(
      message,
      "success",
      shift.overnight
        ? "Calculated successfully. Overnight time was handled automatically."
        : "Calculated successfully."
    );
    result.hidden = false;
  });

  form.addEventListener("reset", () => {
    clearMessage(message);
    result.hidden = true;
  });
}

function initWeeklyCalculator() {
  const form = document.getElementById("weekly-form");
  const result = document.getElementById("weekly-result");
  const message = document.getElementById("weekly-message");

  if (!form || !result || !message) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);

    const rows = Array.from(form.querySelectorAll("tbody tr"));
    const rate = Math.max(0, readNumber(form.rate.value));
    const threshold = Math.max(0, readNumber(form.threshold.value, 40));
    let totalMinutes = 0;
    let hasWorkedDay = false;

    for (const row of rows) {
      const start = row.querySelector("[data-field='start']").value;
      const end = row.querySelector("[data-field='end']").value;
      const breakValue = Math.max(0, readNumber(row.querySelector("[data-field='break']").value));
      const totalCell = row.querySelector(".row-total");

      if (!start && !end) {
        totalCell.textContent = "0h 00m";
        continue;
      }

      if (!start || !end) {
        setMessage(message, "error", "Each worked day needs both a start time and an end time.");
        result.hidden = true;
        return;
      }

      const shift = getShiftMinutes(start, end);
      if (!shift) {
        setMessage(message, "error", "One of the daily times is invalid.");
        result.hidden = true;
        return;
      }

      if (breakValue > shift.minutes) {
        setMessage(message, "error", "A break on one of the weekly rows is longer than the shift.");
        result.hidden = true;
        return;
      }

      const net = shift.minutes - breakValue;
      totalMinutes += net;
      hasWorkedDay = true;
      totalCell.textContent = `${formatMinutes(net)}${shift.overnight ? " • overnight" : ""}`;
    }

    if (!hasWorkedDay) {
      setMessage(message, "error", "Add at least one worked day to calculate the weekly total.");
      result.hidden = true;
      return;
    }

    const regularMinutes = Math.min(totalMinutes, threshold * 60);
    const overtimeMinutes = Math.max(0, totalMinutes - regularMinutes);
    const gross = (regularMinutes / 60) * rate + (overtimeMinutes / 60) * rate * 1.5;

    updateSummary(result, {
      weekTotal: formatMinutes(totalMinutes),
      weekDecimal: `${formatDecimalHours(totalMinutes)} hours`,
      regularHours: formatMinutes(regularMinutes),
      overtimeHours: formatMinutes(overtimeMinutes),
      weeklyPay: currency(gross)
    });

    setMessage(message, "success", "Weekly totals updated.");
    result.hidden = false;
  });

  form.addEventListener("reset", () => {
    clearMessage(message);
    result.hidden = true;
    form.querySelectorAll(".row-total").forEach((cell) => {
      cell.textContent = "0h 00m";
    });
  });
}

function initWorkHoursCalculator() {
  const form = document.getElementById("work-hours-form");
  const result = document.getElementById("work-hours-result");
  const message = document.getElementById("work-hours-message");

  if (!form || !result || !message) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);

    const shift = getShiftMinutes(form.start.value, form.end.value);
    const breakMinutes = Math.max(0, readNumber(form.breakMinutes.value));
    const hourlyRate = Math.max(0, readNumber(form.rate.value));
    const shiftsPerWeek = Math.max(0, readNumber(form.shifts.value, 5));

    if (!shift) {
      setMessage(message, "error", "Please enter a valid shift start and end time.");
      result.hidden = true;
      return;
    }

    if (breakMinutes > shift.minutes) {
      setMessage(message, "error", "Break minutes cannot exceed the shift duration.");
      result.hidden = true;
      return;
    }

    const dailyMinutes = shift.minutes - breakMinutes;
    const weeklyMinutes = dailyMinutes * shiftsPerWeek;

    updateSummary(result, {
      dailyTotal: formatMinutes(dailyMinutes),
      dailyDecimal: `${formatDecimalHours(dailyMinutes)} hours`,
      weeklyEstimate: formatMinutes(weeklyMinutes),
      shiftPay: currency((dailyMinutes / 60) * hourlyRate),
      weeklyPay: currency((weeklyMinutes / 60) * hourlyRate)
    });

    setMessage(
      message,
      "success",
      shift.overnight
        ? "Daily and weekly work hours calculated with overnight handling."
        : "Daily and weekly work hours calculated."
    );
    result.hidden = false;
  });

  form.addEventListener("reset", () => {
    clearMessage(message);
    result.hidden = true;
  });
}

function initHoursBetweenCalculator() {
  const form = document.getElementById("between-form");
  const result = document.getElementById("between-result");
  const message = document.getElementById("between-message");

  if (!form || !result || !message) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);

    const shift = getShiftMinutes(form.start.value, form.end.value);
    if (!shift) {
      setMessage(message, "error", "Please enter a valid start time and end time.");
      result.hidden = true;
      return;
    }

    updateSummary(result, {
      betweenTotal: formatMinutes(shift.minutes),
      betweenDecimal: `${formatDecimalHours(shift.minutes)} hours`,
      overnightNote: shift.overnight ? "Yes, the end time is on the next day." : "No, both times are on the same day.",
      startEnd: `${form.start.value} to ${form.end.value}`
    });

    setMessage(message, "success", "Time difference calculated.");
    result.hidden = false;
  });

  form.addEventListener("reset", () => {
    clearMessage(message);
    result.hidden = true;
  });
}

function initOvertimeCalculator() {
  const form = document.getElementById("overtime-form");
  const result = document.getElementById("overtime-result");
  const message = document.getElementById("overtime-message");

  if (!form || !result || !message) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);

    const totalMinutes = parseDurationInput(form.totalHours.value);
    const thresholdMinutes = parseDurationInput(form.threshold.value);
    const rate = Math.max(0, readNumber(form.rate.value));
    const multiplier = Math.max(1, readNumber(form.multiplier.value, 1.5));

    if (totalMinutes === null || thresholdMinutes === null) {
      setMessage(message, "error", "Use decimal hours like 45.5 or HH:MM values like 45:30.");
      result.hidden = true;
      return;
    }

    const regularMinutes = Math.min(totalMinutes, thresholdMinutes);
    const overtimeMinutes = Math.max(0, totalMinutes - thresholdMinutes);
    const regularPay = (regularMinutes / 60) * rate;
    const overtimePay = (overtimeMinutes / 60) * rate * multiplier;

    updateSummary(result, {
      totalWorked: formatMinutes(totalMinutes),
      regularWorked: formatMinutes(regularMinutes),
      overtimeWorked: formatMinutes(overtimeMinutes),
      overtimePay: currency(overtimePay),
      totalPay: currency(regularPay + overtimePay)
    });

    setMessage(message, "success", "Overtime totals calculated.");
    result.hidden = false;
  });

  form.addEventListener("reset", () => {
    clearMessage(message);
    result.hidden = true;
  });
}

function initTimecardCalculator() {
  const tableBody = document.getElementById("timecard-body");
  const form = document.getElementById("timecard-form");
  const result = document.getElementById("timecard-result");
  const message = document.getElementById("timecard-message");
  const addButton = document.getElementById("add-timecard-row");

  if (!tableBody || !form || !result || !message || !addButton) {
    return;
  }

  let rowIndex = tableBody.querySelectorAll("tr").length;
  addButton.addEventListener("click", () => {
    rowIndex += 1;
    tableBody.insertAdjacentHTML("beforeend", buildTimecardRow(rowIndex));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);

    const rows = Array.from(tableBody.querySelectorAll("tr"));
    let totalMinutes = 0;
    let workedRows = 0;

    for (const row of rows) {
      const start = row.querySelector("[data-field='start']").value;
      const end = row.querySelector("[data-field='end']").value;
      const breakValue = Math.max(0, readNumber(row.querySelector("[data-field='break']").value));
      const totalCell = row.querySelector(".row-total");

      if (!start && !end) {
        totalCell.textContent = "0h 00m";
        continue;
      }

      if (!start || !end) {
        setMessage(message, "error", "Each filled timecard row needs both start and end times.");
        result.hidden = true;
        return;
      }

      const shift = getShiftMinutes(start, end);
      if (!shift) {
        setMessage(message, "error", "One of the timecard entries uses an invalid time.");
        result.hidden = true;
        return;
      }

      if (breakValue > shift.minutes) {
        setMessage(message, "error", "A break on the timecard is longer than the recorded shift.");
        result.hidden = true;
        return;
      }

      const net = shift.minutes - breakValue;
      totalMinutes += net;
      workedRows += 1;
      totalCell.textContent = `${formatMinutes(net)}${shift.overnight ? " • overnight" : ""}`;
    }

    if (!workedRows) {
      setMessage(message, "error", "Add at least one row with worked hours before calculating.");
      result.hidden = true;
      return;
    }

    updateSummary(result, {
      cardRows: String(workedRows),
      cardTotal: formatMinutes(totalMinutes),
      cardDecimal: `${formatDecimalHours(totalMinutes)} hours`,
      averageShift: formatMinutes(totalMinutes / workedRows)
    });

    setMessage(message, "success", "Timecard totals calculated.");
    result.hidden = false;
  });

  form.addEventListener("reset", () => {
    clearMessage(message);
    result.hidden = true;
    tableBody.innerHTML = [buildTimecardRow(1), buildTimecardRow(2), buildTimecardRow(3)].join("");
  });
}

function buildTimecardRow(index) {
  return `
    <tr>
      <td><input type="date" name="date-${index}" aria-label="Date row ${index}"></td>
      <td><input type="time" data-field="start" name="start-${index}" aria-label="Start time row ${index}"></td>
      <td><input type="time" data-field="end" name="end-${index}" aria-label="End time row ${index}"></td>
      <td><input type="number" data-field="break" name="break-${index}" aria-label="Break minutes row ${index}" min="0" step="1" value="30"></td>
      <td><input type="text" name="note-${index}" aria-label="Note row ${index}" placeholder="Optional note"></td>
      <td class="row-total">0h 00m</td>
    </tr>
  `;
}
