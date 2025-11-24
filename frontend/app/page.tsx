'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ reference_id: string; url: string } | null>(null);
  const router = useRouter();

  const validateUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    if (!validateUrl(url)) {
      setError('Please enter a valid URL (must start with http:// or https://)');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/process_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: {
            url: url.trim(),
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const referenceId = data.response?.data?.reference_id;
      const archivedUrl = data.response?.data?.url || url.trim();
      
      if (referenceId) {
        setResponse({ reference_id: referenceId, url: archivedUrl });
      } else {
        setError('No reference_id in response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4">
      {/* Walrus with speech bubble */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <img 
            src="/walrus-big.svg" 
            alt="Walrus" 
            className="w-64 h-auto"
          />
          {/* Speech bubble */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full mb-2">
            <div className="mb-2 bg-white border-4 border-cyan-300 rounded-lg px-4 py-2 shadow-[4px_6px_0_0_rgba(168,85,247,1)] animate-bounce" style={{ animationDuration: '3s' }}>
              <p className="text-xl font-semibold text-gray-800 whitespace-nowrap">Say no to link rots!</p>
            </div>
          </div>
          
        </div>
      </div>
      
      <div className="card w-full max-w-xl bg-base-100 shadow-xl">
        <div className="card-body text-center">
          <h1 className="card-title text-4xl mb-2 justify-center">perma.ws</h1>
          <p className="text-base-content/70 mb-6">
            Preserve web pages as permanent, provable and verifiable archives.
          </p>
          
          {response ? (
            <div className="space-y-4">
              <div className="bg-base-200 rounded-lg p-4">
                <p className="text-sm text-base-content/70 mb-2">Preserved on {new Date().toLocaleDateString()}:</p>
                <p className="text-lg font-mono font-semibold text-base-content">perma.ws/view/{response.reference_id}</p>
                <p className="text-sm text-base-content/70 mt-3 mb-2">Source:</p>
                <p className="text-sm text-base-content break-all">{response.url}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    const params = new URLSearchParams({ url: response.url });
                    router.push(`/view/${response.reference_id}?${params.toString()}`);
                  }}
                  className="transition-all duration-300 bg-cyan-500 text-white border-2 border-cyan-300 shadow-lg shadow-cyan-500/50 hover:bg-cyan-600 hover:shadow-xl hover:shadow-cyan-500/70 hover:scale-105 font-semibold px-6 py-3 rounded-lg"
                >
                  View Archive
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-control">

                <input
                  type="text"
                  placeholder="https://satoshi.nakamotoinstitute.org/emails/bitcoin-list/19"
                  className={`input input-bordered w-full ${error ? 'input-error' : ''}`}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError('');
                  }}
                  disabled={loading}
                />
                {error && (
                  <label className="label justify-center">
                    <span className="label-text-alt text-error">{error}</span>
                  </label>
                )}
              </div>
              
              <div className="form-control mt-6">
                <button
                  type="submit"
                  className={`${loading ? 'loading' : ''} transition-all duration-300 bg-cyan-300/80 text-cyan-800 border-2 border-cyan-300 shadow-md shadow-cyan-200/50 hover:bg-cyan-500 hover:text-white hover:shadow-lg hover:shadow-cyan-500/50 hover:scale-105 hover:border-cyan-300 font-semibold px-6 py-3 rounded-lg`}
                  disabled={loading}
                >
                  {loading ? 'Freezing...' : 'Freeze it in the permafrost'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="mt-6 text-sm text-base-content/70">
        <p>Examples: 
          {" "}<a href="https://perma.ws/view/CY8NI-W4K9" target="_blank" className="text-cyan-500 hover:text-cyan-300 font-mono">CY8NI-W4K9</a>, 
          {" "}<a href="https://perma.ws/view/CYBDL-I5IP" target="_blank" className="text-cyan-500 hover:text-cyan-300 font-mono">CYBDL-I5IP</a>,
          {" "}<a href="https://perma.ws/view/CYBYL-UK90" target="_blank" className="text-cyan-500 hover:text-cyan-300 font-mono">CYBYL-UK90</a>
        </p>
      </div>
    </div>
  );
}
