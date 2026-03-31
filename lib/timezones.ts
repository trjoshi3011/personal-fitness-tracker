export type TimezoneOption = {
  value: string;
  label: string;
};

const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "America/Los_Angeles", label: "PST/PDT (UTC-08:00/-07:00)" },
  { value: "America/Denver", label: "MST/MDT (UTC-07:00/-06:00)" },
  { value: "America/Chicago", label: "CST/CDT (UTC-06:00/-05:00)" },
  { value: "America/New_York", label: "EST/EDT (UTC-05:00/-04:00)" },
  { value: "America/Anchorage", label: "AKST/AKDT (UTC-09:00/-08:00)" },
  { value: "Pacific/Honolulu", label: "HST (UTC-10:00)" },
  { value: "Europe/London", label: "GMT/BST (UTC+00:00/+01:00)" },
  { value: "Europe/Paris", label: "CET/CEST (UTC+01:00/+02:00)" },
  { value: "Asia/Kolkata", label: "IST (UTC+05:30)" },
  { value: "Asia/Tokyo", label: "JST (UTC+09:00)" },
  { value: "Australia/Sydney", label: "AEST/AEDT (UTC+10:00/+11:00)" },
  { value: "UTC", label: "UTC (UTC+00:00)" },
];

export function getTimezones() {
  return TIMEZONE_OPTIONS;
}
