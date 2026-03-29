import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/themeProvider";
import { GameProvider } from "@/lib/gameContext";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import History from "@/pages/History";
import Tournaments from "@/pages/Tournaments";
import EvalDashboard from "@/pages/EvalDashboard";
import Series from "@/pages/Series";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/game/:id" component={Game} />
      <Route path="/history" component={History} />
      <Route path="/tournaments" component={Tournaments} />
      <Route path="/eval" component={EvalDashboard} />
      <Route path="/series" component={Series} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <GameProvider>
            <Toaster />
            <Router />
          </GameProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
