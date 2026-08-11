import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import BriefPage from "@/pages/brief";
import { ErrorState } from "@/components/Freshness";

interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
}

export default function BlogIndex() {
  const { data: articles, isLoading, isError, refetch } = useQuery<BlogArticle[]>({
    queryKey: ["/api/blog"],
  });
  const posts = articles ?? [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="Research"
        testId="blog-header"
        about="Research and analysis on the AI power infrastructure thesis. Data-driven, no hype."
      />

      <div className="max-w-[1200px] mx-auto w-full px-4 md:px-8 py-6 space-y-8">
        {/* Today's read: the daily brief, self-contained (own loading/error state),
            so it can never blank the post list below. */}
        <BriefPage embedded />

        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-4" data-testid="blog-archive-heading">
            Long-form posts
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : isError ? (
            // articles?.map left a bare heading over nothing when the fetch
            // failed, which reads as "we have not written anything".
            <ErrorState label="The post list failed to load." onRetry={() => refetch()} />
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4" data-testid="blog-archive-empty">
              No long-form posts published yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.map((article) => (
                <Link key={article.slug} href={`/blog/${article.slug}`}>
                  <Card
                    className="h-full flex flex-col p-5 border-card-border hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                    data-testid={`blog-card-${article.slug}`}
                  >
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-foreground mb-1.5 leading-tight">{article.title}</h2>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-3">{article.description}</p>
                    </div>
                    <div className="flex items-end justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/70 flex-shrink-0">
                          <Calendar className="h-3 w-3" />
                          {new Date(`${article.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                        {article.keywords.slice(0, 2).map((kw) => (
                          <Badge key={kw} className="text-10 bg-muted/40 text-muted-foreground">{kw}</Badge>
                        ))}
                      </div>
                      <ArrowRight className="h-4 w-4 text-brand flex-shrink-0" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
