import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components';
import { ThemeProvider, I18nProvider, PinProvider } from './contexts';
import {
  Dashboard,
  BlocksPage,
  WalletPage,
  TransactionsPage,
  StakingPage,
  NetworkPage,
  NFTGallery,
  NFTMint,
  NFTCollections,
  NFTCollectionDetail
} from './pages';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <PinProvider>
          <div className="app-layout">
            <Sidebar />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/blocks" element={<BlocksPage />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/staking" element={<StakingPage />} />
                <Route path="/network" element={<NetworkPage />} />

                {/* NFT Routes */}
                <Route path="/nft" element={<NFTGallery />} />
                <Route path="/nft/mint" element={<NFTMint />} />
                <Route path="/nft/collections" element={<NFTCollections />} />
                <Route path="/nft/collections/:id" element={<NFTCollectionDetail />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </PinProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
