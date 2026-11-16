import { compareRecordedPeriods, primaryRecordedValue, resistancePercentage, techniquePracticeNote, triggerInsightSentence } from './period-checkin';

type PeriodStats = {
  quantity: number;
  occurrences: number;
  cravings: number;
  resisted: number;
  resolved: number;
  techniques: number;
  days: number;
  occurrenceCoverageComplete: boolean;
};

type TriggerStat = { name: string; count: number };

type Props = {
  habitName: string;
  isSmoking: boolean;
  periodLabel: string;
  current: PeriodStats;
  previous: PeriodStats;
  configuredTechniques: number;
  distinctTechniques: number;
  topTrigger?: TriggerStat;
};

const unitName = (count: number, singular: string, pluralForm = `${singular}s`) => count === 1 ? singular : pluralForm;
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${unitName(count, singular, pluralForm)}`;

export function PeriodCheckin({ habitName, isSmoking, periodLabel, current, previous, configuredTechniques, distinctTechniques, topTrigger }: Props) {
  const primaryCurrent = isSmoking ? current.quantity : current.occurrences;
  const primaryPrevious = isSmoking ? previous.quantity : previous.occurrences;
  const primaryUnit = isSmoking ? 'cigarette' : 'occurrence';
  const primaryValue = primaryRecordedValue(isSmoking, current.quantity, current.occurrences, current.occurrenceCoverageComplete);
  const comparison = compareRecordedPeriods(primaryCurrent, primaryPrevious, current.occurrenceCoverageComplete && previous.occurrenceCoverageComplete);
  const resistanceRate = resistancePercentage(current.resisted, current.resolved);
  const unknownCravings = Math.max(0, current.cravings - current.resolved);
  const comparisonWord = comparison.reliable ? (comparison.difference < 0 ? 'fewer' : 'more') : '';
  const comparisonDirection = comparison.reliable ? (comparison.difference < 0 ? 'down' : comparison.difference > 0 ? 'up' : 'same') : 'unavailable';
  const comparisonText = !comparison.reliable
    ? 'Not enough confirmed data for a reliable comparison.'
    : comparison.difference === 0
      ? `No change in recorded ${isSmoking ? 'cigarette quantity' : 'occurrences'}.`
      : `${Math.abs(comparison.difference)} ${comparisonWord} recorded ${primaryUnit}${Math.abs(comparison.difference) === 1 ? '' : 's'}${comparison.percentage === undefined ? '' : ` (${comparison.percentage > 0 ? '+' : '−'}${Math.abs(comparison.percentage)}%)`}.`;

  return <div className="period-checkin">
    <article className="period-primary-card" aria-labelledby="period-primary-title">
      <div className="period-card-heading">
        <div><span className="eyebrow">MAIN OUTCOME</span><h3 id="period-primary-title">{isSmoking ? 'Cigarettes recorded' : `Occurrences of ${habitName}`}</h3></div>
        <details className="period-info">
          <summary aria-label="How to read the comparison">i</summary>
          <p>Counts use this period and the previous equally long period. A comparison needs every day in both periods to have logged behavior or an explicit daily confirmation. Incomplete records can change the comparison.</p>
        </details>
      </div>
      <div className="period-primary-value">
        <strong className={primaryValue === undefined ? 'unavailable' : ''}>{primaryValue === undefined ? 'Not confirmed' : primaryValue.toLocaleString()}</strong>
        {primaryValue !== undefined && <>{' '}<span>{isSmoking ? unitName(primaryValue, 'cigarette') : unitName(primaryValue, 'occurrence')}</span></>}
      </div>
      <p className="period-primary-support">{isSmoking
        ? current.occurrences > 0 || current.occurrenceCoverageComplete
          ? `${plural(current.occurrences, 'smoking event')} in this ${periodLabel}.`
          : 'No cigarette quantity confirmed in this period.'
        : primaryValue === undefined
          ? `No ${habitName.toLocaleLowerCase()} occurrences confirmed in this period.`
          : `Recorded during this ${periodLabel}.`}</p>
      <div className={`period-comparison ${comparisonDirection}`} aria-live="polite">
        <span className="period-comparison-label">Previous {periodLabel}</span>
        <strong>{comparisonText}</strong>
        {comparison.reliable && <small>Previous period: {primaryPrevious.toLocaleString()} {isSmoking ? unitName(primaryPrevious, 'cigarette') : unitName(primaryPrevious, 'occurrence')}.</small>}
      </div>
    </article>

    <div className="period-secondary-grid">
      <article className="period-secondary-card">
        <div className="period-card-heading">
          <h3>Cravings resisted</h3>
          <details className="period-info">
            <summary aria-label="How craving resistance is calculated">i</summary>
            <p>Calculated from logged cravings with known outcomes. Unresolved cravings and missing records are excluded.</p>
          </details>
        </div>
        {resistanceRate === undefined
          ? <><strong className="period-secondary-value unavailable">Not available</strong><p>No resolved craving outcomes in this {periodLabel}.</p></>
          : <><strong className="period-secondary-value">{resistanceRate}%</strong><p>{current.resisted} of {current.resolved} resolved cravings resisted in this {periodLabel}.</p><div className="period-resistance-track" role="progressbar" aria-label={`Observed craving resistance, ${resistanceRate} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={resistanceRate}><span style={{ width: `${resistanceRate}%` }}/></div></>}
      </article>

      <article className="period-secondary-card">
        <div className="period-card-heading"><h3>Techniques used</h3></div>
        <strong className="period-secondary-value">{current.techniques.toLocaleString()} <span>applications</span></strong>
        <p>Techniques practiced during this {periodLabel}.</p>
        <small>{techniquePracticeNote(configuredTechniques, distinctTechniques)}</small>
      </article>
    </div>

    <article className="period-trigger-card">
      <div className="period-trigger-copy">
        <span className="eyebrow">BIGGEST TRIGGER INSIGHT</span>
        <h3>Your most logged trigger</h3>
        {topTrigger
          ? <><strong>{topTrigger.name}</strong><p>{triggerInsightSentence(topTrigger, periodLabel)}</p></>
          : <p>{triggerInsightSentence(undefined, periodLabel)}</p>}
      </div>
      <a className="period-trigger-link" href="#logging-trigger-analytics">Explore triggers <span aria-hidden="true">↗</span></a>
    </article>

    <div className="period-support-row" aria-label={`Additional logging context for this ${periodLabel}`}>
      {current.cravings > 0
        ? <span>{current.cravings.toLocaleString()} cravings logged <i>·</i> {unknownCravings.toLocaleString()} unresolved or unknown</span>
        : <span>No cravings logged in this {periodLabel}.</span>}
      {!current.occurrenceCoverageComplete && <span className="period-support-note">Missing logs are not counted as zero behavior.</span>}
    </div>
  </div>;
}
