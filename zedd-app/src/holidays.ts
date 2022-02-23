import { eachYearOfInterval, getYear } from 'date-fns'

export async function getRangeHolidays(
  range: Interval,
  countryCode: string,
  stateCode?: string,
): Promise<Date[]> {
  try {
    let dates: Date[] = []
    for (const year of eachYearOfInterval(range)) {
      dates = [...dates, ...(await getHolidays(getYear(year), countryCode, stateCode))]
    }
    return dates
  } catch (e) {
    throw new Error('Error while getRangeHolidays: ' + e)
  }
}

export async function getHolidays(
  year: number,
  countryCode: string,
  stateCode?: string,
): Promise<Date[]> {
  try {
    if (countryCode !== '') {
      let url = 'https://date.nager.at/api/v3/publicholidays/' + year + '/' + countryCode
      const response = await fetch(url)
      const holidays: { counties: string[]; global: boolean; date: string }[] =
        await response.json()
      let filteredDays: any[] = holidays
      if (stateCode && stateCode !== '') {
        filteredDays = holidays.filter(
          (holiday) => (holiday.counties && holiday.counties.includes(stateCode)) || holiday.global,
        )
      }
      return filteredDays.map((holiday: { date: string }) => new Date(holiday.date))
    }
    return []
  } catch (e) {
    throw new Error('Error while getHolidays: ' + e)
  }
}
export const countries: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'AR', label: 'Argentina' },
  { code: 'AU', label: 'Australia' },
  { code: 'AT', label: 'Austria' },
  { code: 'BE', label: 'Belgium' },
  { code: 'BR', label: 'Brazil' },
  { code: 'CA', label: 'Canada' },
  { code: 'CL', label: 'Chile' },
  { code: 'CN', label: 'China' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CZ', label: 'Czech Republic' },
  { code: 'DK', label: 'Denmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'GT', label: 'Guatemala' },
  { code: 'HU', label: 'Hungary' },
  { code: 'IN', label: 'India' },
  { code: 'IT', label: 'Italy' },
  { code: 'JP', label: 'Japan' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'MX', label: 'Mexico' },
  { code: 'MA', label: 'Morocco' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'NO', label: 'Norway' },
  { code: 'PH', label: 'Philippines' },
  { code: 'PL', label: 'Poland' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'SG', label: 'Singapore' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'ES', label: 'Spain' },
  { code: 'SE', label: 'Sweden' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'VN', label: 'Vietnam' },
  { code: '', label: '' },
]

export const federalStates: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'DE-BW', label: 'Baden Württemberg' },
  { code: 'DE-BY', label: 'Bayern' },
  { code: 'DE-ST', label: 'Sachsen-Anhalt' },
  { code: 'DE-BE', label: 'Berlin' },
  { code: 'DE-BB', label: 'Brandenburg' },
  { code: 'DE-HE', label: 'Hessen' },
  { code: 'DE-NW', label: 'Nordrhein-Westfalen' },
  { code: 'DE-RP', label: 'Rheinland-Pfalz' },
  { code: 'DE-SL', label: 'Saarland' },
  { code: 'DE-TH', label: 'Thüringen' },
  { code: 'DE-MV', label: 'Mecklenburg-Vorpommern' },
  { code: 'DE-SN', label: 'Sachsen' },
  { code: 'DE-HB', label: 'Bremen' },
  { code: 'DE-HH', label: 'Hamburg' },
  { code: 'DE-NI', label: 'Niedersachsen' },
  { code: 'DE-SH', label: 'Schleswig-Holstein' },
  { code: '', label: '' },
]
