import {
  INDIA_ISO_SUFFIX,
  ISO_DATE_REGEX,
  LOCALE_SHORTHANDS,
  STATISTIC_CONFIGS,
} from '../constants';

import {format, formatDistance, formatISO, subDays} from 'date-fns';
import {utcToZonedTime} from 'date-fns-tz';
import i18n from 'i18next';

let locale = null;
const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
});

const getLocale = () => {
  import('date-fns/locale/').then((localePackage) => {
    locale =
      localePackage[
        LOCALE_SHORTHANDS[i18n.language || window.localStorage.i18nextLng]
      ];
  });
};

export const isDevelopmentOrTest = () => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    return true;
  return false;
};

export const getIndiaDate = () => {
  return utcToZonedTime(new Date(), 'Asia/Kolkata');
};

export const getIndiaDateISO = () => {
  return formatISO(getIndiaDate(), {representation: 'date'});
};

export const getIndiaDateYesterday = () => {
  return subDays(getIndiaDate(), 1);
};

export const getIndiaDateYesterdayISO = () => {
  return formatISO(getIndiaDateYesterday(), {representation: 'date'});
};

export const formatLastUpdated = (unformattedDate) => {
  getLocale();
  return formatDistance(new Date(unformattedDate), new Date(), {
    locale: locale,
  });
};

export const parseIndiaDate = (unformattedDate) => {
  if (!unformattedDate) {
    return getIndiaDate();
  }
  if (
    typeof unformattedDate === 'string' &&
    unformattedDate.match(ISO_DATE_REGEX)
  ) {
    unformattedDate += INDIA_ISO_SUFFIX;
  }
  return utcToZonedTime(new Date(unformattedDate), 'Asia/Kolkata');
};

export const formatDate = (unformattedDate, formatString) => {
  if (!unformattedDate) return '';
  if (
    typeof unformattedDate === 'string' &&
    unformattedDate.match(ISO_DATE_REGEX)
  )
    unformattedDate += INDIA_ISO_SUFFIX;
  const date = utcToZonedTime(new Date(unformattedDate), 'Asia/Kolkata');
  return format(date, formatString, {
    locale: locale,
  });
};

export const abbreviateNumber = (number) => {
  const numberCleaned = Math.round(Math.abs(number));
  if (numberCleaned < 1e3) return numberFormatter.format(Math.floor(number));
  else if (numberCleaned >= 1e3 && numberCleaned < 1e5)
    return numberFormatter.format(number / 1e3) + 'K';
  else if (numberCleaned >= 1e5 && numberCleaned < 1e7)
    return numberFormatter.format(number / 1e5) + 'L';
  else if (numberCleaned >= 1e7 && numberCleaned < 1e10)
    return numberFormatter.format(number / 1e7) + 'Cr';
  else if (numberCleaned >= 1e10 && numberCleaned < 1e14)
    return numberFormatter.format(number / 1e10) + 'K Cr';
  else if (numberCleaned >= 1e14)
    return numberFormatter.format(number / 1e14) + 'L Cr';
};

export const formatNumber = (value, option = '', statistic) => {
  if (
    isNaN(value) ||
    (statistic && STATISTIC_CONFIGS[statistic]?.hideZero && value === 0)
  ) {
    return '-';
  } else if (option === 'long') {
    return numberFormatter.format(
      Math.abs(value) < 1 ? value : Math.round(value)
    );
  } else if (option === 'short') {
    return abbreviateNumber(value);
  } else if (option === '%') {
    return `${numberFormatter.format(value)}%`;
  } else if (option === '') {
    return numberFormatter.format(value);
  }
};

export const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const toTitleCase = (str) => {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};

export const getStatistic = (
  data,
  type,
  statistic,
  {
    normalizedByPopulationPer = null,
    movingAverage = false,
    canBeNaN = false,
  } = {}
) => {
  // TODO: Replace delta with daily to remove ambiguity
  //       Or add another type for daily/delta

  let multiplyFactor = 1;
  if (type === 'delta' && movingAverage) {
    type = 'delta7';
    multiplyFactor *= 1 / 7;
  }

  if (normalizedByPopulationPer === 'million') {
    multiplyFactor *= 1e6 / data?.meta?.population;
  } else if (normalizedByPopulationPer === 'lakh') {
    multiplyFactor *= 1e5 / data?.meta?.population;
  } else if (normalizedByPopulationPer === 'hundred') {
    multiplyFactor *= 1e2 / data?.meta?.population;
  }

  let val;
  if (statistic === 'active' || statistic === 'activeRatio') {
    const confirmed = data?.[type]?.confirmed || 0;
    const deceased = data?.[type]?.deceased || 0;
    const recovered = data?.[type]?.recovered || 0;
    const active = confirmed - deceased - recovered;
    if (statistic === 'active') {
      val = active;
    } else if (statistic === 'activeRatio') {
      val = 100 * (active / confirmed);
    } // here we are fetching the data and assigning it to statistics variable
  } else {
    val = data?.[type]?.[statistic];
  }

  const statisticConfig = STATISTIC_CONFIGS[statistic];
  multiplyFactor = (statisticConfig?.nonLinear && 1) || multiplyFactor;

  let result = multiplyFactor * val;
  if (!canBeNaN) {
    result = (!isNaN(result) && result) || 0;
  }
  if (!statisticConfig?.canBeInfinite) {
    result = ((isNaN(result) || isFinite(result)) && result) || 0;
  }
  return result;
};

export const fetcher = (url) => {
  return fetch(url).then((response) => {
    return response.json();
  });
};

export function retry(fn, retriesLeft = 5, interval = 1000) {
  return new Promise((resolve, reject) => {
    fn()
      .then(resolve)
      .catch((error) => {
        setTimeout(() => {
          if (retriesLeft === 1) {
            // reject('maximum retries exceeded');
            reject(error);
            return;
          }

          // Passing on "reject" is the important part
          retry(fn, retriesLeft - 1, interval).then(resolve, reject);
        }, interval);
      });
  });
}
