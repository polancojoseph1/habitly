'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import type { TechniquePractice } from './insights';
import { compareRecordedPeriods, primaryRecordedValue, resistancePercentage, techniqueOutcomePercentages, techniquePracticeNote, triggerInsightSentence } from './period-checkin';
import styles from './period-info-popover.module.css';

type PeriodStats = {
  quantity: number;
  occurrences: number;
  legacyOccurrences: number;
  cravings: number;
  resisted: number;
  resolved: number;
  techniques: number;
  days: number;
  occurrenceCoverageComplete: boolean;
  quantityCoverageComplete: boolean;
};

type TriggerStat = { name: string; count: number };

type Props = {
  habitName: string;
  isSmoking: boolean;
  periodLabel: string;
  current: PeriodStats;
  previous: PeriodStats;
  configuredTechniques: number;
  techniqueApplicationCount: number;
  hasTechniqueFilters: boolean;
  usedTechniques: Pick<TechniquePractice, 'key' | 'name' | 'detail' | 'total' | 'responsive' | 'preventive' | 'resolved' | 'resisted' | 'engaged' | 'unknown'>[];
  topTrigger?: TriggerStat;
};

const unitName = (count: number, singular: string, pluralForm = `${singular}s`) => count === 1 ? singular : pluralForm;
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${unitName(count, singular, pluralForm)}`;

type PopoverPosition = { top: number; left: number; arrowLeft: number; placement: 'top' | 'bottom' };

function PeriodInfoBubble({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;

      const anchor = trigger.getBoundingClientRect();
      const bounds = bubble.getBoundingClientRect();
      const gutter = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const anchorCenter = anchor.left + anchor.width / 2;
      const maxLeft = Math.max(gutter, viewportWidth - bounds.width - gutter);
      const left = Math.max(gutter, Math.min(anchorCenter - bounds.width / 2, maxLeft));
      const belowTop = anchor.bottom + 8;
      const aboveTop = anchor.top - bounds.height - 8;
      const hasRoomBelow = belowTop + bounds.height <= viewportHeight - gutter;
      const placement = hasRoomBelow || aboveTop < gutter ? 'bottom' : 'top';
      const top = placement === 'bottom'
        ? Math.min(belowTop, viewportHeight - bounds.height - gutter)
        : Math.max(gutter, aboveTop);

      const arrowLeft = Math.max(10, Math.min(anchorCenter - left, bounds.width - 10));
      setPosition({ top, left, arrowLeft, placement });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (triggerRef.current?.contains(target) || bubbleRef.current?.contains(target))) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const bubble = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={bubbleRef}
      id={id}
      className={styles.popover}
      data-placement={position?.placement ?? 'bottom'}
      role="tooltip"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >{children}<span className={styles.arrow} aria-hidden="true" style={{ left: position ? `${position.arrowLeft}px` : '18px' }}/></div>,
    document.body,
  ) : null;

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={styles.trigger}
      aria-label={label}
      aria-expanded={open}
      aria-controls={id}
      aria-describedby={open ? id : undefined}
      onClick={() => setOpen(value => !value)}
    >i</button>
    {bubble}
  </>;
}

export function PeriodCheckin({ habitName, isSmoking, periodLabel, current, previous, configuredTechniques, techniqueApplicationCount, hasTechniqueFilters, usedTechniques, topTrigger }: Props) {
  const [techniqueModalOpen, setTechniqueModalOpen] = useState(false);
  const techniqueButtonRef = useRef<HTMLButtonElement>(null);
  const techniqueCloseRef = useRef<HTMLButtonElement>(null);
  const techniqueDialogRef = useRef<HTMLElement>(null);
  const primaryCurrent = isSmoking ? current.quantity : current.occurrences;
  const primaryPrevious = isSmoking ? previous.quantity : previous.occurrences;
  const primaryUnit = isSmoking ? 'cigarette' : 'occurrence';
  const currentCoverageComplete = isSmoking ? current.quantityCoverageComplete : current.occurrenceCoverageComplete;
  const previousCoverageComplete = isSmoking ? previous.quantityCoverageComplete : previous.occurrenceCoverageComplete;
  const primaryValue = primaryRecordedValue(isSmoking, current.quantity, current.occurrences, currentCoverageComplete);
  const comparison = compareRecordedPeriods(primaryCurrent, primaryPrevious, currentCoverageComplete && previousCoverageComplete);
  const resistanceRate = resistancePercentage(current.resisted, current.resolved);
  const unknownCravings = Math.max(0, current.cravings - current.resolved);
  const comparisonWord = comparison.reliable ? (comparison.difference < 0 ? 'fewer' : 'more') : '';
  const comparisonDirection = comparison.reliable ? (comparison.difference < 0 ? 'down' : comparison.difference > 0 ? 'up' : 'same') : 'unavailable';
  const comparisonText = !comparison.reliable
    ? 'Not enough confirmed data for a reliable comparison.'
    : comparison.difference === 0
      ? `No change in recorded ${isSmoking ? 'cigarette quantity' : 'occurrences'}.`
      : `${Math.abs(comparison.difference)} ${comparisonWord} recorded ${primaryUnit}${Math.abs(comparison.difference) === 1 ? '' : 's'}${comparison.percentage === undefined ? '' : ` (${comparison.percentage > 0 ? '+' : '−'}${Math.abs(comparison.percentage)}%)`}.`;

  useEffect(() => {
    if (!techniqueModalOpen) return;
    const body = document.body;
    const root = document.documentElement;
    const previousOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousOverscroll = root.style.overscrollBehavior;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTechniqueModalOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = techniqueDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) {
        event.preventDefault();
        techniqueDialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    window.addEventListener('keydown', onKeyDown);
    techniqueCloseRef.current?.focus();
    return () => {
      body.style.overflow = previousOverflow;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener('keydown', onKeyDown);
      techniqueButtonRef.current?.focus();
    };
  }, [techniqueModalOpen]);

  return <div className="period-checkin">
    <article className="period-primary-card" aria-labelledby="period-primary-title">
      <div className="period-card-heading">
        <div><span className="eyebrow">Main outcome</span><h3 id="period-primary-title">{isSmoking ? 'Cigarettes recorded' : `Occurrences of ${habitName}`}</h3></div>
        <PeriodInfoBubble label="How to read the comparison">{isSmoking
          ? 'Cigarette totals include recorded quantities and explicitly confirmed no-smoking days. Older “Old behavior” check-ins count as smoking episodes, but do not contain cigarette quantities.'
          : 'Counts use this period and the previous equally long period. A comparison needs every day in both periods to have logged behavior or an explicit daily confirmation. Incomplete records can change the comparison.'}</PeriodInfoBubble>
      </div>
      <div className="period-primary-value">
        <strong className={primaryValue === undefined ? 'unavailable' : ''}>{primaryValue === undefined ? 'Not confirmed' : primaryValue.toLocaleString()}</strong>
        {primaryValue !== undefined && <>{' '}<span>{isSmoking ? unitName(primaryValue, 'cigarette') : unitName(primaryValue, 'occurrence')}</span></>}
      </div>
      <p className="period-primary-support">{isSmoking && current.legacyOccurrences > 0
        ? `${plural(current.legacyOccurrences, 'older “Old behavior” check-in')} counted as smoking ${current.legacyOccurrences === 1 ? 'episode' : 'episodes'}; cigarette quantities were not captured.`
        : isSmoking
        ? current.occurrences > 0 || current.occurrenceCoverageComplete
          ? `${plural(current.occurrences, 'smoking event')} during the selected ${periodLabel}.`
          : 'No cigarette quantity confirmed in this period.'
        : primaryValue === undefined
          ? `No ${habitName.toLocaleLowerCase()} occurrences confirmed in this period.`
          : `Recorded during the selected ${periodLabel}.`}</p>
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
          <PeriodInfoBubble label="How craving resistance is calculated">Calculated from logged cravings with known outcomes. Unresolved cravings and missing records are excluded.</PeriodInfoBubble>
        </div>
        {resistanceRate === undefined
          ? <><strong className="period-secondary-value unavailable">Not available</strong><p>No resolved craving outcomes during the selected {periodLabel}.</p></>
          : <><strong className="period-secondary-value">{resistanceRate}%</strong><p>{current.resisted} of {current.resolved} resolved cravings resisted during the selected {periodLabel}.</p><div className="period-resistance-track" role="progressbar" aria-label={`Observed craving resistance, ${resistanceRate} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={resistanceRate}><span style={{ width: `${resistanceRate}%` }}/></div></>}
      </article>

      <button ref={techniqueButtonRef} type="button" className="period-secondary-card period-technique-card" aria-haspopup="dialog" aria-controls="period-technique-dialog" aria-label={`Techniques used, ${techniqueApplicationCount} applications. View technique outcomes.`} onClick={() => setTechniqueModalOpen(true)}>
          <div className="period-technique-heading"><h3>Techniques used</h3><span className="period-technique-chevron" aria-hidden="true"><Icon name="arrow-up-right" size={15}/></span></div>
          <strong className="period-secondary-value">{techniqueApplicationCount.toLocaleString()} <span>applications</span></strong>
          <p>{hasTechniqueFilters ? 'Applications matching the selected filters during this period.' : `Techniques practiced during the selected ${periodLabel}.`}</p>
          <small>{techniquePracticeNote(configuredTechniques, usedTechniques.length, hasTechniqueFilters)}</small>
          <span className="period-technique-toggle">View technique outcomes</span>
      </button>
    </div>

    <article className="period-trigger-card">
      <div className="period-trigger-copy">
        <span className="eyebrow">Biggest trigger insight</span>
        <h3>Your most logged trigger</h3>
        {topTrigger
          ? <><strong>{topTrigger.name}</strong><p>{triggerInsightSentence(topTrigger, periodLabel)}</p></>
          : <p>{triggerInsightSentence(undefined, periodLabel)}</p>}
      </div>
      <a className="period-trigger-link" href="#logging-trigger-analytics">Explore triggers <Icon name="arrow-up-right" size={14}/></a>
    </article>

    <div className="period-support-row" aria-label={`Additional logging context for the selected ${periodLabel}`}>
      {current.cravings > 0
        ? <span>{current.cravings.toLocaleString()} cravings logged <i>·</i> {unknownCravings.toLocaleString()} unresolved or unknown</span>
        : <span>No cravings logged during the selected {periodLabel}.</span>}
      {isSmoking && current.legacyOccurrences > 0
        ? <span className="period-support-note">Older “Old behavior” entries show episodes, not cigarette quantities.</span>
        : !currentCoverageComplete && <span className="period-support-note">Missing logs are not counted as zero behavior.</span>}
    </div>
    {techniqueModalOpen && <div className="modal-backdrop period-technique-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setTechniqueModalOpen(false); }}>
      <section ref={techniqueDialogRef} id="period-technique-dialog" className="builder-modal period-technique-modal" role="dialog" aria-modal="true" aria-labelledby="period-technique-title" aria-describedby="period-technique-method" tabIndex={-1}>
        <header className="modal-header"><div><span className="eyebrow">Technique analytics · {periodLabel}</span><h2 id="period-technique-title">Techniques used</h2><p>Recorded applications and their resolved outcomes.</p></div><button ref={techniqueCloseRef} type="button" className="modal-close" onClick={() => setTechniqueModalOpen(false)} aria-label="Close technique analytics">×</button></header>
        <div className="period-technique-modal-body">
          {usedTechniques.length > 0
            ? <ul className="period-technique-outcome-list">{usedTechniques.map(item => {
                const outcomePercentages = techniqueOutcomePercentages(item.resisted, item.engaged, item.resolved);
                const workedPercentage = outcomePercentages?.worked;
                const notWorkedPercentage = outcomePercentages?.didNotWork;
                return <li key={item.key}>
                  <article className="period-technique-outcome">
                    <header><div><h3>{item.name}</h3>{item.detail && <p className="period-technique-action">{item.detail}</p>}</div><span>{plural(item.total, 'application')}</span></header>
                    {workedPercentage === undefined || notWorkedPercentage === undefined
                      ? <p className="period-technique-outcome-empty">No resolved responsive outcomes to calculate percentages for this technique.</p>
                      : <>
                        <div className="period-technique-outcome-grid">
                          <div><span>Worked</span><strong>{workedPercentage}%</strong><small>{item.resisted} of {item.resolved} resolved responsive episodes were resisted.</small></div>
                          <div><span>Did not work</span><strong>{notWorkedPercentage}%</strong><small>{item.engaged} of {item.resolved} resolved responsive episodes had a habit occurrence recorded.</small></div>
                        </div>
                        <div className="period-technique-outcome-track" role="img" aria-label={`${workedPercentage}% resisted and ${notWorkedPercentage}% with a habit occurrence, among ${item.resolved} resolved responsive episodes`}>
                          <span style={{ width: `${item.resisted / item.resolved * 100}%` }}/><span style={{ width: `${item.engaged / item.resolved * 100}%` }}/>
                        </div>
                      </>}
                    <p className="period-technique-outcome-context">{plural(item.responsive, 'responsive application')} · {plural(item.preventive, 'preventive application')}{item.unknown > 0 ? ` · ${item.unknown} unresolved or unknown responsive ${item.unknown === 1 ? 'episode' : 'episodes'}` : ''}</p>
                  </article>
                </li>;
              })}</ul>
            : <p className="period-technique-empty">{hasTechniqueFilters ? 'No techniques matched the selected filters.' : configuredTechniques === 0 ? 'No techniques are configured for this habit.' : `No technique applications were logged during the selected ${periodLabel}.`}</p>}
          <p id="period-technique-method" className="period-technique-method">Percentages use resolved responsive episodes only. Unresolved or unknown outcomes and preventive applications are excluded. These are descriptive associations, not proof that a technique caused an outcome; techniques linked to the same episode share its recorded outcome.</p>
        </div>
      </section>
    </div>}
  </div>;
}
