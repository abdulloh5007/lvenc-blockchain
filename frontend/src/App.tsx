import { useState } from 'react';
import { Sidebar } from './components';
import { ThemeProvider, I18nProvider } from './contexts';
import { Dashboard, BlocksPage, WalletPage, TransactionsPage, MiningPage, NetworkPage, NFTGallery, NFTMint } from './pages';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'blocks': return <BlocksPage />;
      case 'wallet': return <WalletPage />;
      case 'transactions': return <TransactionsPage />;
      case 'mining': return <MiningPage />;
      case 'network': return <NetworkPage />;
      case 'nft': return <NFTGallery />;
      case 'nft-mint': return <NFTMint />;
      default: return <Dashboard />;
    }
  };

  return (
    <ThemeProvider>
      <I18nProvider>
        <div className="app-layout">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <main className="main-content">{renderPage()}</main>
        </div>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
