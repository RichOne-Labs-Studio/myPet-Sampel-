import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Jaring pengaman terakhir: kalau ada error JavaScript tak terduga saat render
 * (misal data dari Google Spreadsheet ada field yang kosong/tidak sesuai format),
 * tanpa ErrorBoundary React akan meng-unmount SELURUH halaman jadi blank putih.
 * Dengan ini, yang muncul adalah pesan error yang jelas + tombol untuk reload,
 * dan detail errornya tetap dicetak ke console untuk keperluan debugging.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Terjadi kesalahan tak terduga.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Vier Pet Care — Error tertangkap oleh ErrorBoundary:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
          <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-6 shadow-lg text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900">Terjadi kesalahan saat menampilkan halaman</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Kemungkinan ada data yang tidak sesuai format (misalnya kolom kosong di Google Spreadsheet).
                Detail teknis: <span className="font-mono text-rose-700">{this.state.errorMessage}</span>
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-sm transition"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
