import {
  MAP_META,
  MAP_TYPES,
  MAP_VIEWS,
  MAP_VIZS,
  SPRING_CONFIG_NUMBERS,
  STATE_NAMES,
  STATISTIC_CONFIGS,
} from '../constants';
import {formatNumber, getStatistic, retry} from '../utils/commonFunctions';

import classnames from 'classnames';
import equal from 'fast-deep-equal';
import produce from 'immer';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  lazy,
} from 'react';
import {useTranslation} from 'react-i18next';
import {useHistory} from 'react-router-dom';
import {animated, useSpring} from 'react-spring';
import {useSessionStorage} from 'react-use';

const MapVisualizer = lazy(() => retry(() => import('./MapVisualizer')));

function MapExplorer({
  stateCode: mapCode = 'TT',
  data,
  mapView = MAP_VIEWS.DISTRICTS,
  mapStatistic,
  regionHighlighted,
  setRegionHighlighted,
  noRegionHighlightedDistrictData,
  lastDataDate,
}) {
  const {t} = useTranslation();
  const mapExplorerRef = useRef();

  const [isPerLakh] = useSessionStorage('isPerLakhMap', false);
  const [delta7Mode] = useSessionStorage('delta7ModeMap', false);

  const mapMeta = MAP_META[mapCode];
  const mapData =
    mapMeta.mapType === MAP_TYPES.COUNTRY ? data : {[mapCode]: data[mapCode]};

  const statisticConfig = STATISTIC_CONFIGS[mapStatistic];

  const isDistrictView =
    mapView === MAP_VIEWS.DISTRICTS && mapMeta.mapType === MAP_TYPES.STATE;

  const hoveredRegion = useMemo(() => {
    const hoveredData =
      (regionHighlighted.districtName
        ? data[regionHighlighted.stateCode]?.districts?.[
            regionHighlighted.districtName
          ]
        : data[regionHighlighted.stateCode]) || {};

    return produce(hoveredData, (draft) => {
      draft.name =
        regionHighlighted.districtName ||
        STATE_NAMES[regionHighlighted.stateCode];
    });
  }, [data, regionHighlighted.stateCode, regionHighlighted.districtName]);

  const history = useHistory();
  const panelRef = useRef();

  useEffect(() => {
    if (history.location.hash === '#MapExplorer') {
      panelRef.current.scrollIntoView();
    }
  }, [history]);

  const trail = useMemo(() => {
    const styles = [];

    [0, 0, 0, 0, 0, 0, 0].map((element, index) => {
      styles.push({
        animationDelay: `${index * 250}ms`,
      });
      return null;
    });

    return styles;
  }, []);

  const getMapStatistic = useCallback(
    (data) => {
      const statisticConfig = STATISTIC_CONFIGS[mapStatistic];

      const type =
        (statisticConfig?.showDelta && delta7Mode) ||
        statisticConfig?.onlyDelta7
          ? 'delta7'
          : 'total';

      return getStatistic(data, type, mapStatistic, {
        expiredDate: lastDataDate,
        normalizedByPopulationPer:
          isPerLakh && mapStatistic != 'population' ? 'lakh' : null,
        canBeNaN: true,
      });
    },
    [mapStatistic, isPerLakh, lastDataDate, delta7Mode]
  );

  let currentVal = getMapStatistic(hoveredRegion);
  if (isNaN(currentVal)) {
    currentVal = '-';
  }

  const spring = useSpring({
    total: currentVal,
    config: {tension: 250, ...SPRING_CONFIG_NUMBERS},
  });

  const mapViz = statisticConfig?.mapConfig?.spike
    ? MAP_VIZS.SPIKE
    : isPerLakh ||
      statisticConfig?.mapConfig?.colorScale ||
      statisticConfig?.nonLinear
    ? MAP_VIZS.CHOROPLETH
    : MAP_VIZS.BUBBLE;

  // const stickied = anchor === 'mapexplorer' || (expandTable && width >= 769);

  const transformStatistic = useCallback(
    (val) =>
      statisticConfig?.mapConfig?.transformFn
        ? statisticConfig.mapConfig.transformFn(val)
        : val,
    [statisticConfig]
  );

  const zoneColor = statisticConfig?.mapConfig?.colorScale
    ? statisticConfig.mapConfig.colorScale(transformStatistic(currentVal))
    : '';

  return (
    <div className={classnames('MapExplorer')}>
      <div className="panel" ref={panelRef}>
        <div className="panel-left fadeInUp" style={trail[0]}>
          <h2
            className={classnames(mapStatistic)}
            style={{color: zoneColor || statisticConfig?.color}}
          >
            {/* this is the title of the state that is hovered */}
            {t(hoveredRegion.name)}
            {hoveredRegion.name ===
              ` [${t(STATE_NAMES[regionHighlighted.stateCode])}]`}
          </h2>
          {/* this will give the value to the hovered circle */}
          {regionHighlighted.stateCode && (
            <h1
              className={classnames('district', mapStatistic)}
              style={{color: zoneColor || statisticConfig?.color}}
            >
              {/* this animated div returns the value of the hovered region */}
              <animated.div>
                {spring.total.to((total) =>
                  !noRegionHighlightedDistrictData ||
                  !statisticConfig?.hasPrimary
                    ? formatNumber(total, statisticConfig.format, mapStatistic)
                    : '-'
                )}
              </animated.div>
            </h1>
          )}
        </div>
      </div>

      <div ref={mapExplorerRef} className="fadeInUp" style={trail[3]}>
        {mapStatistic && (
          <Suspense>
            <MapVisualizer
              data={mapData}
              statistic={mapStatistic}
              {...{
                mapCode,
                isDistrictView,
                mapViz,
                setRegionHighlighted,
                getMapStatistic,
                transformStatistic,
              }}
            ></MapVisualizer>
          </Suspense>
        )}
      </div>
    </div>
  );
}

const isEqual = (prevProps, currProps) => {
  if (!equal(prevProps.stateCode, currProps.stateCode)) {
    return false;
  } else if (!equal(prevProps.regionHighlighted, currProps.regionHighlighted)) {
    return false;
  } else if (!equal(prevProps.mapView, currProps.mapView)) {
    return false;
  } else if (!equal(prevProps.mapStatistic, currProps.mapStatistic)) {
    return false;
  } else if (!equal(prevProps.anchor, currProps.anchor)) {
    return false;
  } else if (!equal(prevProps.hideDistrictData, currProps.hideDistrictData)) {
    return false;
  } else if (
    !equal(
      prevProps.data?.TT?.meta?.['last_updated'],
      currProps.data?.TT?.meta?.['last_updated']
    )
  ) {
    return false;
  } else if (!equal(prevProps.data?.TT?.total, currProps.data?.TT?.total)) {
    return false;
  } else if (
    !equal(
      prevProps.noRegionHighlightedDistrictData,
      currProps.noRegionHighlightedDistrictData
    )
  ) {
    return false;
  }
  return true;
};

export default memo(MapExplorer, isEqual);
