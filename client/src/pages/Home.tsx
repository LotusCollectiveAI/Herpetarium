import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { Play, Users, Bot, Lock, Zap } from "lucide-react";
import { SiOpenai, SiAnthropic, SiGoogle } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { toast } = useToast();

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name to create a game.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await apiRequest("POST", "/api/games", { hostName: playerName.trim() });
      const data = await response.json();
      sessionStorage.setItem("playerName", playerName.trim());
      setLocation(`/game/${data.gameId}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create game. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name to join a game.",
        variant: "destructive",
      });
      return;
    }

    if (!gameCode.trim()) {
      toast({
        title: "Game code required",
        description: "Please enter a game code to join.",
        variant: "destructive",
      });
      return;
    }

    setIsJoining(true);
    sessionStorage.setItem("playerName", playerName.trim());
    setLocation(`/game/${gameCode.trim().toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Lock className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">Decrypto</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Decrypto</h1>
            <p className="text-muted-foreground">
              A multiplayer word deduction game. Give clues, decode messages, and intercept your opponents!
            </p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Your Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="text"
                placeholder="Enter your name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                data-testid="input-player-name"
              />
            </CardContent>
          </Card>

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="create" className="flex-1" data-testid="tab-create">
                Create Game
              </TabsTrigger>
              <TabsTrigger value="join" className="flex-1" data-testid="tab-join">
                Join Game
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    New Game
                  </CardTitle>
                  <CardDescription>
                    Create a new game and invite friends or AI players
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleCreateGame}
                    disabled={isCreating || !playerName.trim()}
                    className="w-full"
                    size="lg"
                    data-testid="button-create-game"
                  >
                    {isCreating ? "Creating..." : "Create Game"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="join">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Join Game
                  </CardTitle>
                  <CardDescription>
                    Enter a game code to join an existing game
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    type="text"
                    placeholder="Enter game code..."
                    value={gameCode}
                    onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="font-mono text-center text-lg tracking-widest"
                    data-testid="input-game-code"
                  />
                  <Button
                    onClick={handleJoinGame}
                    disabled={isJoining || !playerName.trim() || !gameCode.trim()}
                    className="w-full"
                    size="lg"
                    data-testid="button-join-game"
                  >
                    {isJoining ? "Joining..." : "Join Game"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Play with AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Add AI players to your game! Choose from:
              </p>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 text-sm bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded">
                  <SiOpenai className="h-3 w-3" />
                  <span>ChatGPT</span>
                </div>
                <div className="flex items-center gap-1 text-sm bg-orange-500/10 text-orange-500 px-2 py-1 rounded">
                  <SiAnthropic className="h-3 w-3" />
                  <span>Claude</span>
                </div>
                <div className="flex items-center gap-1 text-sm bg-blue-500/10 text-blue-500 px-2 py-1 rounded">
                  <SiGoogle className="h-3 w-3" />
                  <span>Gemini</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground">
            <p>2-4 players per team. Best played on mobile!</p>
          </div>
        </div>
      </main>

      <footer className="p-4 text-center text-sm text-muted-foreground border-t">
        <p>Decrypto is a word deduction game by Thomas Dagenais-Lespérance</p>
      </footer>
    </div>
  );
}
