import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageTitle, RuleSection } from "@/components/editorial";
import BriefPage from "@/pages/brief";

interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
}

export default function BlogIndex() {
  const { data: articles, isLoading } = useQuery<BlogArticle[]>({
    queryKey: ["/api/blog"],
  });

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="Analysis"
          dek="Research on the AI power buildout: sourced, checked, and written to be read."
          testId="blog-header"
        />

        {/* Today's read: the daily brief, self-contained (own loading/error
            state), so it can never blank the post list below. */}
        <BriefPage embedded />

        <RuleSection head="Long-form" testId="blog-archive">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : (
            <div>
              {articles?.map((article) => (
                <article
                  key={article.slug}
                  className="border-b border-rule py-5 first:pt-0 last:border-b-0"
                  data-testid={`blog-card-${article.slug}`}
                >
                  <h2 className="font-serif font-medium text-[24px] leading-snug text-ink">
                    <Link href={`/blog/${article.slug}`} className="no-underline hover:text-brand-ink">
                      {article.title}
                    </Link>
                  </h2>
                  <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-ink-secondary">
                    {article.description}
                  </p>
                  <p className="mt-2 text-[12.5px] text-ink-muted">
                    {new Date(`${article.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    {article.keywords.length > 0 && <> · {article.keywords.slice(0, 3).join(" · ")}</>}
                  </p>
                </article>
              ))}
            </div>
          )}
        </RuleSection>
      </div>
    </PageShell>
  );
}
