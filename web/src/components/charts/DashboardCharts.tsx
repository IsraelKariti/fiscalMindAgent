import { useMemo } from 'react';
import type { ClientDocument, DocumentFile, Email, NextScheduled } from '../../api';
import { LOCALE } from '../../format';
import { ChartCard, ChartEmpty, NEUTRAL, SERIES } from './common';
import { DonutChart, type DonutDatum } from './DonutChart';
import { LineChart } from './LineChart';
import { SankeyChart, type SankeyLinkDef, type SankeyNodeDef } from './SankeyChart';

const WEEKS = 8;

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday-based
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

function weekStarts(): Date[] {
  const monday = startOfWeek(new Date());
  const starts: Date[] = [];
  for (let k = WEEKS - 1; k >= 0; k--) {
    starts.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * k));
  }
  return starts;
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
}

const FILE_KINDS = [
  { label: 'קובצי PDF', color: SERIES.violet },
  { label: 'תמונות', color: SERIES.cyan },
  { label: 'גיליונות', color: SERIES.green },
  { label: 'מסמכים', color: SERIES.pink },
  { label: 'אחר', color: NEUTRAL },
] as const;

function fileKind(f: DocumentFile): (typeof FILE_KINDS)[number]['label'] {
  const ct = f.content_type.toLowerCase();
  const name = f.filename.toLowerCase();
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'קובצי PDF';
  if (ct.startsWith('image/')) return 'תמונות';
  if (ct.includes('spreadsheet') || ct.includes('excel') || ct.includes('csv') || /\.(xlsx?|csv)$/.test(name)) {
    return 'גיליונות';
  }
  if (ct.includes('word') || ct.startsWith('text/') || /\.(docx?|txt|rtf)$/.test(name)) return 'מסמכים';
  return 'אחר';
}

interface Props {
  documents: ClientDocument[];
  emails: Email[];
  files: DocumentFile[];
  nextScheduled: NextScheduled | null;
}

export function DashboardCharts({ documents, emails, files, nextScheduled }: Props) {
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
    return FILE_KINDS.map((k) => ({ label: k.label, value: counts.get(k.label) ?? 0, color: k.color }));
  }, [files]);

  const filesByRequest = useMemo<DonutDatum[]>(() => {
    const counts = new Map<string, number>();
    let unlinked = 0;
    for (const f of files) {
      if (f.client_document_id) {
        const name = documents.find((d) => d.id === f.client_document_id)?.name ?? 'מסמך שהוסר';
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
    if (rest > 0) data.push({ label: 'מסמכים אחרים', value: rest, color: SERIES.green });
    if (unlinked > 0) data.push({ label: 'לא מקושר לבקשה', value: unlinked, color: NEUTRAL });
    return data;
  }, [files, documents]);

  const sankey = useMemo(() => {
    const collectedDocs = documents.filter((d) => d.status === 'collected');
    const linkedDocIds = new Set(files.map((f) => f.client_document_id).filter(Boolean));
    const viaAttachment = collectedDocs.filter((d) => linkedDocIds.has(d.id)).length;
    const outstanding = documents.length - collectedDocs.length;
    const nodes: SankeyNodeDef[] = [
      { id: 'requested', label: 'התבקשו', color: SERIES.violet, col: 0 },
      { id: 'collected', label: 'נאספו', color: SERIES.green, col: 1 },
      { id: 'outstanding', label: 'חסרים', color: SERIES.amber, col: 1 },
      { id: 'attachment', label: 'בצירוף למייל', color: SERIES.cyan, col: 2 },
      { id: 'manual', label: 'סומנו ידנית', color: SERIES.pink, col: 2 },
      // The outstanding branch keeps its color: same documents, still waiting.
      { id: 'awaiting', label: nextScheduled ? 'מעקב מתוזמן' : 'ממתין ללקוח', color: SERIES.amber, col: 2 },
    ];
    const links: SankeyLinkDef[] = [
      { source: 'requested', target: 'collected', value: collectedDocs.length },
      { source: 'requested', target: 'outstanding', value: outstanding },
      { source: 'collected', target: 'attachment', value: viaAttachment },
      { source: 'collected', target: 'manual', value: collectedDocs.length - viaAttachment },
      { source: 'outstanding', target: 'awaiting', value: outstanding },
    ];
    return { nodes, links };
  }, [documents, files, nextScheduled]);

  const hasEmails = emails.some((e) => e.status !== 'draft');

  return (
    <div className="chart-grid">
      <ChartCard title="פעילות מיילים" subtitle={`לפי שבוע · ${WEEKS} השבועות האחרונים`} span={2}>
        {hasEmails ? (
          <LineChart
            title="מיילים לפי שבוע"
            labels={activity.labels}
            series={[
              { name: 'נשלחו', color: SERIES.violet, values: activity.sent },
              { name: 'התקבלו', color: SERIES.cyan, values: activity.received },
            ]}
          />
        ) : (
          <ChartEmpty>אין עדיין מיילים</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title="קבצים לפי סוג">
        {files.length > 0 ? (
          <DonutChart title="קבצים לפי סוג" data={filesByType} centerLabel="קבצים" />
        ) : (
          <ChartEmpty>עדיין לא התקבלו קבצים</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title="מסלול המסמכים" subtitle="איך המסמכים שהתבקשו מתקדמים" span={2}>
        {documents.length > 0 ? (
          <SankeyChart title="מסלול המסמכים" nodes={sankey.nodes} links={sankey.links} unit="מסמכים" />
        ) : (
          <ChartEmpty>עדיין לא התבקשו מסמכים</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title="קבצים לפי בקשה">
        {files.length > 0 ? (
          <DonutChart title="קבצים לפי מסמך מבוקש" data={filesByRequest} centerLabel="קבצים" />
        ) : (
          <ChartEmpty>עדיין לא התקבלו קבצים</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title="קבצים שהתקבלו" subtitle={`מצטבר · ${WEEKS} השבועות האחרונים`} span={3}>
        {files.length > 0 ? (
          <LineChart
            title="קבצים שהתקבלו לאורך זמן"
            labels={cumulativeFiles.labels}
            series={[{ name: 'קבצים שהתקבלו', color: SERIES.green, values: cumulativeFiles.values }]}
            area
            height={170}
          />
        ) : (
          <ChartEmpty>עדיין לא התקבלו קבצים</ChartEmpty>
        )}
      </ChartCard>
    </div>
  );
}
