const { google } = require('googleapis');

// Indian holidays calendar ID (public Google Calendar)
const CALENDAR_IDS = {
  india: 'en.indian#holiday@group.v.calendar.google.com',
  karnataka: 'en.indian#holiday@group.v.calendar.google.com',
};

/**
 * Fetch holidays from Google Calendar API for a specific year
 * @param {number} year
 * @param {string} region
 * @returns {Promise<Array>}
 */
async function fetchHolidays(year, region = 'india') {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not configured in environment variables');
    }

    const calendar = google.calendar({
      version: 'v3',
      auth: apiKey,
    });

    const calendarId = CALENDAR_IDS[region] || CALENDAR_IDS.india;

    const timeMin = new Date(year, 0, 1).toISOString();
    const timeMax = new Date(year, 11, 31, 23, 59, 59).toISOString();

    console.log(`Fetching holidays for year ${year} from Google Calendar...`);

    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 200,
    });

    if (!response.data.items || response.data.items.length === 0) {
      console.log(`No holidays found for year ${year}`);
      return [];
    }

    const holidays = response.data.items.map((event) => {
      const startDate = event.start.date || event.start.dateTime?.split('T')[0];
      const endDate = event.end.date || event.end.dateTime?.split('T')[0];

      return {
        holiday_name: event.summary,
        start_date: startDate,
        end_date: endDate || startDate,
        is_government: true,
        source: 'google',
      };
    });

    console.log(`✅ Fetched ${holidays.length} holidays for year ${year}`);
    return holidays;
  } catch (error) {
    console.error('Error fetching holidays from Google Calendar:', error.message);

    if (error.code === 403) {
      throw new Error(
        'Google Calendar API access forbidden. Please check your API key and ensure the Calendar API is enabled.'
      );
    } else if (error.code === 400) {
      throw new Error(
        'Invalid request to Google Calendar API. Please check the year parameter.'
      );
    } else if (error.message.includes('API key not valid')) {
      throw new Error(
        'Invalid Google API key. Please check your GOOGLE_API_KEY in .env file.'
      );
    }

    throw error;
  }
}

/**
 * Fallback holidays data (in case Google API fails)
 */
function getFallbackHolidays(year) {
  const fallbackHolidays = {
    2025: [
      {
        holiday_name: 'Republic Day',
        start_date: '2025-01-26',
        end_date: '2025-01-26',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Holi',
        start_date: '2025-03-14',
        end_date: '2025-03-14',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Good Friday',
        start_date: '2025-04-18',
        end_date: '2025-04-18',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Independence Day',
        start_date: '2025-08-15',
        end_date: '2025-08-15',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Gandhi Jayanti',
        start_date: '2025-10-02',
        end_date: '2025-10-02',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Dussehra',
        start_date: '2025-10-02',
        end_date: '2025-10-02',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Diwali',
        start_date: '2025-10-20',
        end_date: '2025-10-20',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Christmas',
        start_date: '2025-12-25',
        end_date: '2025-12-25',
        is_government: true,
        source: 'fallback',
      },
    ],
    2026: [
      {
        holiday_name: 'Republic Day',
        start_date: '2026-01-26',
        end_date: '2026-01-26',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Holi',
        start_date: '2026-03-04',
        end_date: '2026-03-04',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Good Friday',
        start_date: '2026-04-03',
        end_date: '2026-04-03',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Independence Day',
        start_date: '2026-08-15',
        end_date: '2026-08-15',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Gandhi Jayanti',
        start_date: '2026-10-02',
        end_date: '2026-10-02',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Dussehra',
        start_date: '2026-10-21',
        end_date: '2026-10-21',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Diwali',
        start_date: '2026-11-08',
        end_date: '2026-11-08',
        is_government: true,
        source: 'fallback',
      },
      {
        holiday_name: 'Christmas',
        start_date: '2026-12-25',
        end_date: '2026-12-25',
        is_government: true,
        source: 'fallback',
      },
    ],
  };

  return fallbackHolidays[year] || [];
}

/**
 * Get holidays with fallback to hardcoded data if API fails
 * @param {number} year
 * @returns {Promise<Array>}
 */
async function getHolidaysWithFallback(year) {
  try {
    const holidays = await fetchHolidays(year);
    return holidays;
  } catch (error) {
    console.warn(
      'Failed to fetch from Google Calendar, using fallback data:',
      error.message
    );
    return getFallbackHolidays(year);
  }
}

/**
 * Test the Google Calendar API connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const currentYear = new Date().getFullYear();
    await fetchHolidays(currentYear);
    console.log('✅ Google Calendar API connection successful');
    return true;
  } catch (error) {
    console.error('❌ Google Calendar API connection failed:', error.message);
    return false;
  }
}

module.exports = {
  fetchHolidays,
  getHolidaysWithFallback,
  testConnection,
  CALENDAR_IDS,
};
