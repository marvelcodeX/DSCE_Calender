const express = require('express');
const router = express.Router();

const db = require('../database');
const {
  getHolidaysWithFallback,
  testConnection,
} = require('../googleCalendar');

/**
 * ============================================================
 * GET /api/holidays/:year
 * Fetch government holidays for a given year
 * Source: Google Calendar API (with fallback)
 * ============================================================
 */
router.get('/:year', async (req, res) => {
  try {
    const year = Number(req.params.year);

    // Validate year
    if (!Number.isInteger(year) || year < 2020 || year > 2035) {
      return res.status(400).json({
        success: false,
        error: 'Year must be between 2020 and 2035',
      });
    }

    // 1. Check cache (7-day TTL)
    const cached = await db.holidayCache.get(year);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      const TTL = 7 * 24 * 60 * 60 * 1000;
      if (ageMs < TTL) {
        return res.json({
          success: true,
          year,
          source: 'cache',
          count: cached.holidays.length,
          holidays: cached.holidays,
        });
      }
    }

    // 2. Fetch from Google Calendar (with fallback)
    const holidays = await getHolidaysWithFallback(year);

    // 3. Cache results
    if (holidays.length > 0) {
      await db.holidayCache.set(year, holidays);
    }

    res.json({
      success: true,
      year,
      source: process.env.GOOGLE_API_KEY ? 'google_or_fallback' : 'fallback',
      count: holidays.length,
      holidays,
    });
  } catch (err) {
    console.error('Holiday fetch error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch holidays',
      hint: 'Check Google API key or internet connection',
    });
  }
});

/**
 * ============================================================
 * POST /api/holidays/custom
 * Add a college-specific holiday
 * ============================================================
 */
router.post('/custom', async (req, res) => {
  try {
    const { holiday_name, start_date, end_date } = req.body;

    if (!holiday_name || !start_date) {
      return res.status(400).json({
        success: false,
        error: 'holiday_name and start_date are required',
      });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(start_date)) {
      return res.status(400).json({
        success: false,
        error: 'start_date must be YYYY-MM-DD',
      });
    }

    if (end_date && !datePattern.test(end_date)) {
      return res.status(400).json({
        success: false,
        error: 'end_date must be YYYY-MM-DD',
      });
    }

    const holiday = await db.holiday.create({
      holiday_name,
      start_date,
      end_date: end_date || start_date,
      source: 'custom',
      is_government: false,
    });

    res.status(201).json({
      success: true,
      message: 'Custom holiday added',
      holiday,
    });
  } catch (err) {
    console.error('Custom holiday error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to add custom holiday',
    });
  }
});

/**
 * ============================================================
 * GET /api/holidays/custom/all
 * Get all custom (college) holidays
 * ============================================================
 */
router.get('/custom/all', async (req, res) => {
  try {
    const holidays = await db.holiday.getAll();
    res.json({
      success: true,
      count: holidays.length,
      holidays,
    });
  } catch (err) {
    console.error('Fetch custom holidays error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch custom holidays',
    });
  }
});

/**
 * ============================================================
 * POST /api/holidays/cache/clear
 * Clear expired holiday cache
 * ============================================================
 */
router.post('/cache/clear', async (req, res) => {
  try {
    const result = await db.holidayCache.clearOld();
    res.json({
      success: true,
      deleted: result.deleted,
    });
  } catch (err) {
    console.error('Cache clear error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
    });
  }
});

/**
 * ============================================================
 * GET /api/holidays/test-google
 * Test Google Calendar API connectivity
 * ============================================================
 */
router.get('/test-google', async (req, res) => {
  const connected = await testConnection();
  res.json({
    success: connected,
    apiKeyConfigured: !!process.env.GOOGLE_API_KEY,
    message: connected
      ? 'Google Calendar API working'
      : 'Google Calendar API failed',
  });
});

module.exports = router;