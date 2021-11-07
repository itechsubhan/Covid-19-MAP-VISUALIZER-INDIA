import {formatDate} from '../utils/commonFunctions';

import {memo} from 'react';
import {useTranslation} from 'react-i18next';

function StateHeader({data}) {
  const {t} = useTranslation();

  return (
    <div className="StateHeader">
      <div>
        {data?.meta?.['last_updated'] && (
          <h5>
            {`${t('Last Updated on')} ${formatDate(
              data.meta.last_updated,
              'dd MMM, p'
            )} ${t('IST')}`}
          </h5>
        )}
      </div>
    </div>
  );
}

export default memo(StateHeader);
