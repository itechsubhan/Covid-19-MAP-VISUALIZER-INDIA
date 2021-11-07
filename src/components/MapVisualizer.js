import {
  MAP_DIMENSIONS,
  MAP_META,
  MAP_TYPES,
  MAP_VIZS,
  STATE_CODES,
  STATISTIC_CONFIGS,
  UNKNOWN_DISTRICT_KEY,
} from '../constants';

import classnames from 'classnames';
import {max} from 'd3-array';
import {json} from 'd3-fetch';
import {geoIdentity, geoPath} from 'd3-geo';
import {scaleSqrt} from 'd3-scale';
import {select} from 'd3-selection';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {useHistory} from 'react-router-dom';
import useSWR from 'swr';
import {feature, mesh} from 'topojson-client';

function MapVisualizer({
  mapCode,
  isDistrictView,
  mapViz,
  data,
  setRegionHighlighted,
  statistic,
  getMapStatistic,
  transformStatistic,
}) {
  const svgRef = useRef(null);

  const mapMeta = MAP_META[mapCode];
  const history = useHistory();

  const {data: geoData} = useSWR(
    mapMeta.geoDataFile,
    async (file) => {
      return await json(file);
    },
    {suspense: false, revalidateOnFocus: false}
  );

  const statisticConfig = STATISTIC_CONFIGS[statistic];

  const strokeColor = useCallback(
    (alpha) => (statisticConfig?.color || '#343a40') + alpha,
    [statisticConfig]
  );

  const features = useMemo(() => {
    if (!geoData) return null;

    const featuresWrap = !isDistrictView
      ? feature(geoData, geoData.objects.states).features
      : mapMeta.mapType === MAP_TYPES.COUNTRY && mapViz !== MAP_VIZS.CHOROPLETH
      ? [
          ...feature(geoData, geoData.objects.states).features,
          ...feature(geoData, geoData.objects.districts).features,
        ]
      : feature(geoData, geoData.objects.districts).features;
    // Add id to each feature
    return featuresWrap.map((feature) => {
      const district = feature.properties.district;
      const state = feature.properties.st_nm;
      const obj = Object.assign({}, feature);
      obj.id = `${mapCode}-${state}${district ? '-' + district : ''}`;
      return obj;
    });
  }, [geoData, mapCode, isDistrictView, mapViz, mapMeta]);

  const districtsSet = useMemo(() => {
    if (!geoData || !isDistrictView) return {};
    return feature(geoData, geoData.objects.districts).features.reduce(
      (stateCodes, feature) => {
        const stateCode = STATE_CODES[feature.properties.st_nm];
        if (!stateCodes[stateCode]) {
          stateCodes[stateCode] = new Set();
        }
        stateCodes[stateCode].add(feature.properties.district);
        return stateCodes;
      },
      {}
    );
  }, [geoData, isDistrictView]);

  const statisticMax = useMemo(() => {
    const stateCodes = Object.keys(data).filter(
      (stateCode) =>
        stateCode !== 'TT' && Object.keys(MAP_META).includes(stateCode)
    );

    if (!isDistrictView) {
      return max(stateCodes, (stateCode) =>
        transformStatistic(getMapStatistic(data[stateCode]))
      );
    } else {
      const districtData = stateCodes.reduce((res, stateCode) => {
        const districts = Object.keys(data[stateCode]?.districts || []).filter(
          (districtName) =>
            (districtsSet?.[stateCode] || new Set()).has(districtName) ||
            (mapViz !== MAP_VIZS.CHOROPLETH &&
              districtName === UNKNOWN_DISTRICT_KEY)
        );
        res.push(
          ...districts.map((districtName) =>
            transformStatistic(
              getMapStatistic(data[stateCode].districts[districtName])
            )
          )
        );
        return res;
      }, []);
      return max(districtData);
    }
  }, [
    data,
    isDistrictView,
    getMapStatistic,
    mapViz,
    districtsSet,
    transformStatistic,
  ]);

  const mapScale = useMemo(() => {
    if (mapViz === MAP_VIZS.BUBBLE) {
      // No negative values
      return scaleSqrt([0, Math.max(1, statisticMax || 0)], [0, 40])
        .clamp(true)
        .nice(3);
    }
  }, [mapViz, statisticMax]);

  const onceTouchedRegion = useRef(null);

  // Reset on tapping outside map
  useEffect(() => {
    const svg = select(svgRef.current);

    svg.attr('pointer-events', 'auto').on('click', () => {
      onceTouchedRegion.current = null;
      setRegionHighlighted({
        stateCode: mapCode,
        districtName: null,
      });
    });
  }, [mapCode, setRegionHighlighted]);

  const path = useMemo(() => {
    if (!geoData) return null;
    return geoPath(geoIdentity());
  }, [geoData]);

  const sortedFeatures = useMemo(() => {
    if (mapViz === MAP_VIZS.CHOROPLETH) {
      return [];
    } else {
      return (features || [])
        .map((feature) => {
          const stateCode = STATE_CODES[feature.properties.st_nm];
          const districtName = feature.properties.district;
          const stateData = data[stateCode];

          if (!isDistrictView) {
            feature.value = getMapStatistic(stateData);
          } else {
            const districtData = stateData?.districts?.[districtName];

            if (districtName) feature.value = getMapStatistic(districtData);
            else
              feature.value = getMapStatistic(
                stateData?.districts?.[UNKNOWN_DISTRICT_KEY]
              );
          }

          return feature;
        })
        .filter((feature) => feature.value > 0)
        .sort((featureA, featureB) => featureB.value - featureB.value);
    }
  }, [mapViz, isDistrictView, getMapStatistic, features, data]);

  // Bubbles denoting the no of cases/etc
  useEffect(() => {
    const svg = select(svgRef.current);
    svg
      .select('.circles')
      .selectAll('circle')
      .data(
        mapViz === MAP_VIZS.BUBBLE ? sortedFeatures : [],
        (feature) => feature.id
      )
      .join(
        (enter) =>
          enter
            .append('circle')
            .attr(
              'transform',
              (feature) => `translate(${path.centroid(feature)})`
            )
            .attr('fill-opacity', 0.25)
            .style('cursor', 'pointer')
            .attr('pointer-events', 'all')
            .call((enter) => {
              enter.append('title');
            }),
        (update) => update
      )
      .on('mouseenter', (event, feature) => {
        if (onceTouchedRegion.current) return;
        setRegionHighlighted({
          stateCode: STATE_CODES[feature.properties.st_nm],
        });
      })
      .call((sel) => {
        sel
          .attr('fill', statisticConfig.color + '70')
          .attr('stroke', statisticConfig.color + '70')
          .attr('r', (feature) => mapScale(feature.value));
      });
  }, [
    mapMeta.mapType,
    mapViz,
    sortedFeatures,
    history,
    mapScale,
    path,
    setRegionHighlighted,
    statisticConfig,
    getMapStatistic,
  ]);

  // Boundaries of the map
  useEffect(() => {
    if (!geoData) return;
    const svg = select(svgRef.current);

    let meshStates = [];

    if (mapMeta.mapType === MAP_TYPES.COUNTRY) {
      meshStates = [mesh(geoData, geoData.objects.states)];
      meshStates[0].id = `${mapCode}-states`;
    }
    svg
      .select('.state-borders')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .selectAll('path')
      .data(meshStates, (d) => d.id)
      .join(
        (enter) => enter.append('path').attr('d', path).attr('stroke', '#fff0'),
        (update) => update
      )
      .attr('stroke', strokeColor.bind(this, '40'));
  }, [geoData, mapMeta, mapCode, mapViz, statistic, path, strokeColor]);

  return (
    <>
      <div className="svg-parent">
        <svg
          id="chart"
          className={classnames({
            zone: !!statisticConfig?.mapConfig?.colorScale,
          })}
          viewBox={`0 0 ${MAP_DIMENSIONS[0]} ${MAP_DIMENSIONS[1]}`}
          preserveAspectRatio="xMidYMid meet"
          ref={svgRef}
        >
          <g className="state-borders" />
          <g className="circles" />
        </svg>
      </div>
    </>
  );
}

export default MapVisualizer;
