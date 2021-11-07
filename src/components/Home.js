import {
  API_REFRESH_INTERVAL,
  DATA_API_ROOT,
  MAP_VIEWS,
  PRIMARY_STATISTICS,
  UNKNOWN_DISTRICT_KEY,
} from '../constants';
import useStickySWR from '../hooks/useStickySWR';
import {
  fetcher,
  getStatistic,
  parseIndiaDate,
  retry,
} from '../utils/commonFunctions';

import classnames from 'classnames';
import {formatISO, max} from 'date-fns';
import {useMemo, useRef, useState, lazy, Suspense} from 'react';
import {useLocalStorage, useSessionStorage} from 'react-use';

const Level = lazy(() => retry(() => import('./Level')));
const MapExplorer = lazy(() => retry(() => import('./MapExplorer')));
const MapSwitcher = lazy(() => retry(() => import('./MapSwitcher')));
const StateHeader = lazy(() => retry(() => import('./StateHeader')));

function Home() {
  const [regionHighlighted, setRegionHighlighted] = useState({
    stateCode: 'TT',
    districtName: null,
  });

  const [anchor] = useLocalStorage('anchor', null);
  const [mapStatistic, setMapStatistic] = useSessionStorage(
    'mapStatistic',
    'active'
  );
  const [mapView] = useLocalStorage('mapView', MAP_VIEWS.STATES);

  const [date] = useState('');

  const {data} = useStickySWR(
    `${DATA_API_ROOT}/data${date ? `-${date}` : ''}.min.json`,
    fetcher,
    {
      revalidateOnMount: true,
      refreshInterval: API_REFRESH_INTERVAL,
    }
  );

  const homeRightElement = useRef();

  const lastDataDate = useMemo(() => {
    const updatedDates = [
      data?.['TT']?.meta?.date,
      data?.['TT']?.meta?.tested?.date,
      data?.['TT']?.meta?.vaccinated?.date,
    ].filter((date) => date);
    return updatedDates.length > 0
      ? formatISO(max(updatedDates.map((date) => parseIndiaDate(date))), {
          representation: 'date',
        })
      : null;
  }, [data]);

  const noDistrictDataStates = useMemo(
    () =>
      // Heuristic: All cases are in Unknown
      Object.entries(data || {}).reduce((res, [stateCode, stateData]) => {
        res[stateCode] = !!(
          stateData?.districts &&
          stateData.districts?.[UNKNOWN_DISTRICT_KEY] &&
          PRIMARY_STATISTICS.every(
            (statistic) =>
              getStatistic(stateData, 'total', statistic) ===
              getStatistic(
                stateData.districts[UNKNOWN_DISTRICT_KEY],
                'total',
                statistic
              )
          )
        );
        return res;
      }, {}),
    [data]
  );

  const noRegionHighlightedDistrictData =
    regionHighlighted?.stateCode &&
    regionHighlighted?.districtName &&
    regionHighlighted.districtName !== UNKNOWN_DISTRICT_KEY &&
    noDistrictDataStates[regionHighlighted.stateCode];

  return (
    <>
      <div className="Home">
        <div
          className={classnames('home-right')}
          ref={homeRightElement}
          style={{minHeight: '4rem'}}
        >
          <div style={{position: 'relative', marginTop: '1rem'}}>
            {data && (
              <Suspense fallback={<div style={{height: '50rem'}} />}>
                <MapSwitcher {...{mapStatistic, setMapStatistic}} />
                <Level data={data['TT']} />
              </Suspense>
            )}
          </div>

          <>
            {data && (
              <div
                className={classnames('map-container', {
                  stickied: anchor === 'mapexplorer',
                })}
              >
                <Suspense fallback={<div style={{height: '50rem'}} />}>
                  <StateHeader data={data['TT']} />
                  <MapExplorer
                    {...{
                      stateCode: 'TT',
                      data,
                      mapStatistic,
                      mapView,
                      regionHighlighted,
                      setRegionHighlighted,
                      lastDataDate,
                      noRegionHighlightedDistrictData,
                    }}
                  />
                </Suspense>
              </div>
            )}
          </>
        </div>
      </div>
    </>
  );
}
export default Home;
