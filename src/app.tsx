import { useEffect } from 'react';
import { AnalysisDashboard } from './components/analysis/AnalysisDashboard';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Sections } from './components/Sections';
import { CommitAndResetSection } from './components/Sections/CommitAndResetSection/CommitAndResetSection';
import { ConfigSection } from './components/Sections/ConfigSection';
import { ThemeProvider } from './components/ThemeProvider';
import { Button } from './components/ui/button';
import { setActivePage, useQRScoutState } from './store/store';

import { StatsigProvider, useClientAsyncInit } from '@statsig/react-bindings';
import { runStatsigAutoCapture } from '@statsig/web-analytics';
import { FloatingFormValue } from './components/FloatingFormValue';

export function App() {
  const { teamNumber, pageTitle, activePage } = useQRScoutState(state => ({
    teamNumber: state.formData.teamNumber,
    pageTitle: state.formData.page_title,
    activePage: state.activePage,
  }));
  const statsigKey = import.meta.env.VITE_STATSIG_CLIENT_KEY ?? '';
  const { client, isLoading } = useClientAsyncInit(
    statsigKey,
    {
      userID: `${teamNumber}`,
    },
    {
      networkConfig: {
        networkTimeoutMs: 2000,
      },
    },
  );

  useEffect(() => {
    if (client && !isLoading) {
      runStatsigAutoCapture(client);
    }
  }, [client, isLoading]);

  const appContent = (
    <ThemeProvider>
      <div className="min-h-screen py-2">
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <h1 className="mb-4 font-sans text-6xl font-bold">
            <div className={`font-rhr text-primary`}>{pageTitle}</div>
          </h1>
          <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => setActivePage('scout')}
              variant={activePage === 'scout' ? 'default' : 'secondary'}
            >
              Scout Form
            </Button>
            <Button
              onClick={() => setActivePage('analysis')}
              variant={activePage === 'analysis' ? 'default' : 'secondary'}
            >
              Analysis
            </Button>
          </div>
          <FloatingFormValue />
          {activePage === 'scout' ? (
            <form className="w-full px-4" onSubmit={e => e.preventDefault()}>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                <Sections />
                <CommitAndResetSection />
                <ConfigSection />
              </div>
            </form>
          ) : (
            <AnalysisDashboard />
          )}
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );

  return statsigKey && client && !isLoading ? (
    <StatsigProvider client={client}>{appContent}</StatsigProvider>
  ) : (
    appContent
  );
}
