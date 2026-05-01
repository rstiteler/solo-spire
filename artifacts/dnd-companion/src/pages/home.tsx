import { useListCampaigns, useCreateCampaign, useDeleteCampaign } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Plus, Trash2, Play } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: campaigns, isLoading } = useListCampaigns();
  const deleteCampaign = useDeleteCampaign();

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this campaign?")) {
      await deleteCampaign.mutateAsync({ id });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex justify-between items-end border-b border-border pb-6">
          <div>
            <h1 className="text-4xl font-serif font-bold text-primary mb-2">Grimoire of Adventures</h1>
            <p className="text-muted-foreground italic">Select a tome to resume your journey, or begin anew.</p>
          </div>
          <Link href="/campaign/new">
            <Button size="lg" className="gap-2 font-serif tracking-wide bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-5 h-5" />
              New Campaign
            </Button>
          </Link>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card/50 border-border">
                <CardHeader>
                  <Skeleton className="h-6 w-2/3 bg-muted" />
                  <Skeleton className="h-4 w-1/3 bg-muted" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : campaigns?.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/20">
            <h3 className="text-xl font-serif text-muted-foreground mb-4">The pages are blank.</h3>
            <Link href="/campaign/new">
              <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                Start a New Adventure
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns?.map((campaign) => (
              <Card key={campaign.id} className="bg-card border-card-border hover:border-primary transition-colors duration-300 flex flex-col group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <CardTitle className="font-serif text-2xl text-foreground group-hover:text-primary transition-colors">
                    {campaign.name}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Level {campaign.level} {campaign.currentLocation ? `• ${campaign.currentLocation}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Last played: {campaign.lastPlayedAt ? format(new Date(campaign.lastPlayedAt), 'MMM d, yyyy') : 'Never'}</p>
                    <p>XP: {campaign.xp}</p>
                    <p>Gold: {campaign.gold}</p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between relative z-10 pt-4 border-t border-border/50">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(campaign.id)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Link href={`/campaign/${campaign.id}`}>
                    <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-serif">
                      <Play className="w-4 h-4 fill-current" />
                      Resume
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}