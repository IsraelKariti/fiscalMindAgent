import { useMemo } from 'react';
import type { ClientDocument, DocumentFile, Email, NextScheduled } from '../../api';
import { useT, type Messages } from '../../i18n';
import { ChartCard, ChartEmpty, NEUTRAL, SERIES } from './common';
import { DonutChart, type DonutDatum } from './DonutChart';
import { LineChart } from './LineChart';
import { SankeyChart, type SankeyLinkDef, type SankeyNodeDef } from './SankeyChart';
import { startOfWeek, weekLabel, WEEKS, weekStarts } from './weeks';

const FILE_KINDS = [
  { id: 'pdf', labelKey: 'filePdf', color: SERIES.violet },
  { id: 'image', labelKey: 'fileImages', color: SERIES.cyan },
  { id: 'sheet', labelKey: 'fileSheets', color: SERIES.green },
  { id: 'doc', labelKey: 'fileDocs', color: SERIES.pink },
  { id: 'other', labelKey: 'fileOther', color: NEUTRAL },
] as const satisfies readonly { id: string; labelKey: keyof Messages; color: string }[];

function fileKind(f: DocumentFile): (typeof FILE_KINDS)[number]['id'] {
  const ct = f.content_type.toLowerCase();
  const name = f.filename.toLowerCase();
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (ct.startsWith('image/')) return 'image';
  if (ct.includes('spreadsheet') || ct.includes('excel') || ct.includes('csv') || /\.(xlsx?|csv)$/.test(name)) {
    return 'sheet';
  }
  if (ct.includes('word') || ct.startsWith('text/') || /\.(docx?|txt|rtf)$/.test(name)) return 'doc';
  return 'other';
}

interface Props {
  documents: ClientDocument[];
  emails: Email[];
  files: DocumentFile[];
  nextScheduled: NextScheduled | null;
}

export function DashboardCharts({ documents, emails, files, nextScheduled }: Props) {
  const { t } = useT();
  const activity = useMemo(() => {
    const starts = weekStarts();
    const index = new Map(starts.map((d, i) => [d.getTime(), i]));
    const sent = new Array<number>(WEEKS).fill(0);
    const received = new Array<number>(WEEKS).fill(0);
    for (const e of emails) {
      if (e.status === 'draft') continue;
      const week = startOfWeek(new Date(e.sent_at ?? e.created_at)).getTime();
      const i = index.get(week);
      if (i === undefined) continue;
      if (e.direction === 'outbound') sent[i] = (sent[i] ?? 0) + 1;
      else received[i] = (received[i] ?? 0) + 1;
    }
    return { labels: starts.map(weekLabel), sent, received };
  }, [emails]);

  const cumulativeFiles = useMemo(() => {
    const starts = weekStarts();
    const values = starts.map((start) => {
      const weekEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime();
      return files.filter((f) => new Date(f.created_at).getTime() < weekEnd).length;
    });
    return { labels: starts.map(weekLabel), values };
  }, [files]);

  const filesByType = useMemo<DonutDatum[]>(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      const kind = fileKind(f);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return FILE_KINDS.map((k) => ({ label: t[k.labelKey], value: counts.get(k.id) ?? 0, color: k.color }));
  }, [files, t]);

  const filesByRequest = useMemo<DonutDatum[]>(() => {
    const counts = new Map<string, number>();
    let unlinked = 0;
    for (const f of files) {
      if (f.client_document_id) {
        const name = documents.find((d) => d.id === f.client_document_id)?.name ?? t.removedDocument;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      } else {
        unlinked++;
      }
    }
    const named = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const slots = [SERIES.violet, SERIES.cyan, SERIES.pink, SERIES.amber];
    const data: DonutDatum[] = named
      .slice(0, slots.length)
      .map((d, i) => ({ label: d.name, value: d.count, color: slots[i] ?? NEUTRAL }));
    const rest = named.slice(slots.length).reduce((sum, d) => sum + d.count, 0);
    if (rest > 0) data.push({ label: t.otherDocuments, value: rest, color: SERIES.green });
    if (unlinked > 0) data.push({ label: t.unlinkedToRequest, value: unlinked, color: NEUTRAL });
    return data;
  }, [files, documents, t]);

  const sankey = useMemo(() => {
    const collectedDocs = documents.filter((d) => d.status === 'collected');
    const linkedDocIds = new Set(files.map((f) => f.client_document_id).filter(Boolean));
    const viaAttachment = collectedDocs.filter((d) => linkedDocIds.has(d.id)).length;
    const outstanding = documents.length - collectedDocs.length;
    const nodes: SankeyNodeDef[] = [
      { id: 'requested', label: t.nodeRequested, color: SERIES.violet, col: 0 },
      { id: 'collected', label: t.nodeCollected, color: SERIES.green, col: 1 },
      { id: 'outstanding', label: t.nodeMissing, color: SERIES.amber, col: 1 },
      { id: 'attachment', label: t.nodeViaAttachment, color: SERIES.cyan, col: 2 },
      { id: 'manual', label: t.nodeMarkedManually, color: SERIES.pink, col: 2 },
      // The outstanding branch keeps its color: same documents, still waiting.
      { id: 'awaiting', label: nextScheduled ? t.nodeFollowUpScheduled : t.nodeAwaitingClient, color: SERIES.amber, col: 2 },
    ];
    const links: SankeyLinkDef[] = [
      { source: 'requested', target: 'collected', value: collectedDocs.length },
      { source: 'requested', target: 'outstanding', value: outstanding },
      { source: 'collected', target: 'attachment', value: viaAttachment },
      { source: 'collected', target: 'manual', value: collectedDocs.length - viaAttachment },
      { source: 'outstanding', target: 'awaiting', value: outstanding },
    ];
    return { nodes, links };
  }, [documents, files, nextScheduled, t]);

  const hasEmails = emails.some((e) => e.status !== 'draft');

  return (
    <div className="chart-grid">
      <ChartCard title={t.emailActivity} subtitle={t.perWeekLastN(WEEKS)} span={2}>
        {hasEmails ? (
          <LineChart
            title={t.emailsPerWeek}
            labels={activity.labels}
            series={[
              { name: t.seriesSent, color: SERIES.violet, values: activity.sent },
              { name: t.seriesReceived, color: SERIES.cyan, values: activity.received },
            ]}
          />
        ) : (
          <ChartEmpty>{t.noEmailsYet}</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title={t.filesByType}>
        {files.length > 0 ? (
          <DonutChart title={t.filesByType} data={filesByType} centerLabel={t.filesCenterLabel} />
        ) : (
          <ChartEmpty>{t.noFilesYet}</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title={t.documentJourney} subtitle={t.documentJourneySubtitle} span={2}>
        {documents.length > 0 ? (
          <SankeyChart title={t.documentJourney} nodes={sankey.nodes} links={sankey.links} unit={t.documentsUnit} />
        ) : (
          <ChartEmpty>{t.noDocsRequestedYet}</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title={t.filesByRequest}>
        {files.length > 0 ? (
          <DonutChart title={t.filesByRequestedDoc} data={filesByRequest} centerLabel={t.filesCenterLabel} />
        ) : (
          <ChartEmpty>{t.noFilesYet}</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title={t.filesReceived} subtitle={t.cumulativeLastN(WEEKS)} span={3}>
        {files.length > 0 ? (
          <LineChart
            title={t.filesOverTime}
            labels={cumulativeFiles.labels}
            series={[{ name: t.filesReceived, color: SERIES.green, values: cumulativeFiles.values }]}
            area
            height={170}
          />
        ) : (
          <ChartEmpty>{t.noFilesYet}</ChartEmpty>
        )}
      </ChartCard>
    </div>
  );
}
