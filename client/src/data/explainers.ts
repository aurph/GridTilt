/**
 * The explainer videos and the sources behind their narration. Files live in
 * client/public/media/explainers.
 *
 * Everything under /media is served with a one-year immutable cache
 * (server/static.ts), so a re-cut must use a new file name: move the -v1 suffix
 * forward here and for the new files. Overwriting a file in place would leave
 * returning visitors on the old cut.
 */
export interface ExplainerSource {
  label: string;
  url: string;
}

export interface Explainer {
  /** Also the anchor on /explainers. */
  id: string;
  title: string;
  /** Printed beside the title: the player shows no length until it has loaded. */
  duration: string;
  video: string;
  poster: string;
  captions: string;
  sources: ExplainerSource[];
}

const files = (name: string) => ({
  video: `/media/explainers/${name}-v1.mp4`,
  poster: `/media/explainers/${name}-v1.jpg`,
  captions: `/media/explainers/${name}-v1.vtt`,
});

const AEP_OHIO = { label: "AEP Ohio, Data Center Tariff", url: "https://www.aepohio.com/company/about/rates/data-center-tariff/" };
const DOMINION_LETTER = {
  label: "Dominion Energy letter to PJM, Jan 6, 2026",
  url: "https://www.pjm.com/-/media/DotCom/planning/res-adeq/load-forecast/dominion-documentation.pdf",
};
const FERC_LARGE_LOAD = {
  label: "FERC news release, June 18, 2026",
  url: "https://www.ferc.gov/news-events/news/ferc-launches-aggressive-targeted-action-speed-large-load-integration",
};
const FERC_SHOW_CAUSE = { label: "FERC, June 2026 show cause orders", url: "https://www.ferc.gov/cost-transparency-customer-protection" };

export const EXPLAINERS: Explainer[] = [
  {
    id: "who-runs-your-grid",
    title: "Who runs your grid?",
    duration: "1:04",
    ...files("e1-who-runs-your-grid"),
    sources: [
      { label: "EIA, interconnections and balancing authorities", url: "https://www.eia.gov/todayinenergy/detail.php?id=27152" },
      { label: "FERC, Electric Power Markets", url: "https://www.ferc.gov/electric-power-markets" },
      { label: "PJM, Who We Are", url: "https://www.pjm.com/about-pjm/who-we-are" },
      { label: "MISO, About MISO", url: "https://www.misoenergy.org/about/" },
      { label: "ERCOT, About ERCOT", url: "https://www.ercot.com/about" },
      { label: "FERC, Frequently Asked Questions", url: "https://www.ferc.gov/frequently-asked-questions-faqs-about-ferc" },
      FERC_LARGE_LOAD,
      { label: "FERC, An Overview of the Commission", url: "https://www.ferc.gov/sites/default/files/2020-07/ferc101.pdf" },
      FERC_SHOW_CAUSE,
      {
        label: "Virginia SCC, data center fact sheet",
        url: "https://www.scc.virginia.gov/media/sccvirginiagov-home/about-the-scc/fact-sheets/scc-data-center-initiatives-02-2026.pdf",
      },
      AEP_OHIO,
    ],
  },
  {
    id: "three-megawatt-numbers",
    title: "Three megawatt numbers",
    duration: "1:04",
    ...files("e2-three-megawatt-numbers"),
    sources: [
      {
        label: "The Green Grid, White Paper 49",
        url: "https://datacenters.lbl.gov/sites/default/files/WP49-PUE%20A%20Comprehensive%20Examination%20of%20the%20Metric_v6.pdf",
      },
      {
        label: "LBNL, 2024 US Data Center Energy Usage Report",
        url: "https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf",
      },
      AEP_OHIO,
      DOMINION_LETTER,
      { label: "PJM, 2026 Long-Term Load Forecast Report", url: "https://www.pjm.com/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report.pdf" },
    ],
  },
  {
    id: "what-is-the-queue",
    title: "What is the queue?",
    duration: "1:04",
    ...files("e3-what-is-the-queue"),
    sources: [
      { label: "LBNL, Queued Up", url: "https://emp.lbl.gov/queues" },
      { label: "FERC, Explainer on the Interconnection Final Rule", url: "https://www.ferc.gov/explainer-interconnection-final-rule" },
      { label: "DOE, grid equipment shortages, Oct 26, 2026", url: "https://www.energy.gov/oe/articles/innovative-solutions-grid-equipment-shortages" },
      AEP_OHIO,
      DOMINION_LETTER,
      FERC_LARGE_LOAD,
      FERC_SHOW_CAUSE,
      { label: "ERCOT, Batch Zero update", url: "https://www.ercot.com/files/docs/2026/09/11/14-Batch-Zero-Update.pdf" },
    ],
  },
];
