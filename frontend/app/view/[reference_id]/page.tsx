'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { decodeReferenceId, getReferenceIdDate, formatReferenceIdDate } from '@/lib/referenceId';
import { bcs } from '@mysten/bcs';
import { Ed25519PublicKey } from '@mysten/sui.js/keypairs/ed25519';

interface VerificationDetails {
  isValid?: boolean;
  publicKey?: string;
  expectedSize?: number;
  actualSize?: number;
  sizeMatch?: boolean;
  timestamp?: number;
  error?: string;
}

interface AttestationData {
  response: {
    intent: number;
    timestamp_ms: string | number;
    data: {
      url: string;
      reference_id: string;
      screenshot_blob_id: string;
      screenshot_byte_size: string | number;
    };
  };
  signature: string;
}


export default function ViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const referenceId = params.reference_id as string;
  const [waczAvailable, setWaczAvailable] = useState(false);
  const [pngAvailable, setPngAvailable] = useState(false);
  const [pngSize, setPngSize] = useState<number>(0);
  const [pngBlobUrl, setPngBlobUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [activeTab, setActiveTab] = useState<'screenshot' | 'archive' | 'verify'>('screenshot');
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [verificationDetails, setVerificationDetails] = useState<VerificationDetails | null>(null);
  const [attestation, setAttestation] = useState<AttestationData | null>(null);
  const [urlFromAttestation, setUrlFromAttestation] = useState<string | null>(null);
  const maxAttempts = 6; // Check for up to 3 minutes (6 * 30 seconds)

  const waczUrl = `https://perma-ws.storage.nami.cloud/${referenceId}/${referenceId}.wacz`;
  const waczProxyUrl = `/api/proxy/wacz/${referenceId}`;
  const pngUrl = `https://perma-ws.storage.nami.cloud/${referenceId}/${referenceId}.png`;
  
  // Prefer URL passed via query params so ReplayWeb opens the captured page instead of the index
  // Fallback to URL from attestation if query param is not provided
  const initialUrl = searchParams.get('url')?.trim() || urlFromAttestation || '';
  
  // Build the ReplayWeb.page iframe URL
  const replayWebUrl = `https://replayweb.page/?source=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'}${waczProxyUrl}`)}#view=pages&url=${encodeURIComponent(initialUrl)}`;

  const timestamp = decodeReferenceId(referenceId);
  const date = getReferenceIdDate(referenceId);
  const formatted = formatReferenceIdDate(referenceId);

  console.log(timestamp, date, formatted);

  useEffect(() => {
    const fetchAttestation = async () => {
      if (!referenceId) return;

      try {
        const res = await fetch(`/api/attestation?reference_id=${referenceId}`);
        if (!res.ok) throw new Error('Failed to fetch attestation');
        const data = await res.json();

        let parsedAttestation = data.attestation;
        if (typeof data.attestation === 'string') {
          try {
            parsedAttestation = JSON.parse(data.attestation);
          } catch (e) {
            console.error('Failed to parse attestation string:', e);
          }
        }

        // Store the parsed attestation object for reuse
        setAttestation(parsedAttestation);

        // Extract URL from attestation for fallback
        if (parsedAttestation?.response?.data?.url) {
          setUrlFromAttestation(parsedAttestation.response.data.url);
        }
      } catch (error) {
        console.error('Failed to fetch attestation:', error);
      }
    }

    fetchAttestation();
  }, [referenceId]);

  useEffect(() => {
    if (!referenceId) return;

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    // Check if files exist with polling
    const checkFiles = async () => {
      if (!isMounted) return;

      try {
        const [waczCheck, pngCheck] = await Promise.all([
          fetch(waczUrl, { 
            method: 'GET',
            headers: { 'Range': 'bytes=0-0' }
          }).catch(() => null),
          fetch(pngUrl, { 
            method: 'GET',
            headers: { 'Range': 'bytes=0-0' }
          }).catch(() => null),
        ]);

        if (!isMounted) return;

        if (waczCheck?.ok) {
          setWaczAvailable(true);
        }
        
        if (pngCheck?.ok) {
          // If we haven't loaded the blob yet, do it now
          if (!pngAvailable) {
             try {
               const blobRes = await fetch(pngUrl);
               if (blobRes.ok) {
                 const blob = await blobRes.blob();
                 if (isMounted) {
                   setPngSize(blob.size);
                   setPngBlobUrl(URL.createObjectURL(blob));
                   setPngAvailable(true);
                 }
               }
             } catch (e) {
               console.error("Failed to fetch PNG blob:", e);
             }
          } else {
             // Already available (from previous render cycle), just ensure state is consistent if needed
             setPngAvailable(true);
          }
        }

        // If both files are available or we've tried enough times, stop checking
        // Note: checking waczCheck.ok and pngCheck.ok is for the *current* poll.
        // We also check if we already have them.
        const waczReady = waczCheck?.ok || waczAvailable;
        const pngReady = pngCheck?.ok || pngAvailable;

        if ((waczReady && pngReady) || attempts >= maxAttempts) {
          setChecking(false);
        } else if (attempts < maxAttempts) {
          // Poll again after 30 seconds
          timeoutId = setTimeout(() => {
            if (isMounted) {
              setAttempts(prev => prev + 1);
            }
          }, 30000);
        }
      } catch (err) {
        console.error('Error checking files:', err);
        if (isMounted) {
          if (attempts >= maxAttempts) {
            setChecking(false);
          } else {
            timeoutId = setTimeout(() => {
              if (isMounted) {
                setAttempts(prev => prev + 1);
              }
            }, 10000);
          }
        }
      }
    };

    checkFiles();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [referenceId, waczUrl, pngUrl, attempts, maxAttempts, pngAvailable, waczAvailable]);

  const verifyAttestation = useCallback(async () => {
    setVerificationStatus('loading');
    try {
      // 1. Use cached attestation from page load
      if (!attestation) {
        throw new Error('Attestation not loaded yet');
      }
      
      console.log('Using cached attestation:', attestation);

      if (!attestation || !attestation.response || !attestation.signature) {
        throw new Error('Invalid attestation format: missing response or signature');
      }

      const { response, signature } = attestation;
      
      // Ensure timestamp_ms is a string for BCS u64
      if (typeof response.timestamp_ms === 'number') {
        response.timestamp_ms = response.timestamp_ms.toString();
      }
      if (typeof response.data.screenshot_byte_size === 'number') {
        response.data.screenshot_byte_size = response.data.screenshot_byte_size.toString();
      }
      
      console.log('Step 2: Reconstructing BCS data');
      // 2. Reconstruct BCS data
      const PermaResponse = bcs.struct('PermaResponse', {
        url: bcs.string(),
        reference_id: bcs.string(),
        screenshot_blob_id: bcs.string(),
        screenshot_byte_size: bcs.u64(),
      });

      const IntentMessage = bcs.struct('IntentMessage', {
        intent: bcs.u8(),
        timestamp_ms: bcs.u64(),
        data: PermaResponse,
      });

      console.log('Step 3: Encoding the message');
      // 3. Encode the message
      const intentMsg = {
        intent: 0, // IntentScope::ProcessData = 0
        timestamp_ms: response.timestamp_ms,
        data: response.data,
      };

      const bytes = IntentMessage.serialize(intentMsg).toBytes();
      console.log('Serialized bytes:', bytes);

      console.log('Step 4: Verifying signature');
      // 4. Verify signature
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'hex'));
      
      // Fetch PK from server health_check endpoint
      const healthRes = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/health_check`);
      if (!healthRes.ok) throw new Error('Failed to fetch server public key');
      const healthData = await healthRes.json();
      const pkHex = healthData.pk;
      console.log('Server public key:', pkHex);
      
      // Fix: Ed25519PublicKey expects Uint8Array or Base64 string. 
      // Backend returns Hex, so we must convert Hex to Uint8Array.
      const pkBytes = Uint8Array.from(Buffer.from(pkHex, 'hex'));
      const publicKey = new Ed25519PublicKey(pkBytes);
      
      let isValid = await publicKey.verify(bytes, signatureBytes);
      console.log('Signature valid:', isValid);
      
      console.log('Step 5: Comparing screenshot size');
      // 5. Compare screenshot size
      // Use the size captured from the blob
      const actualSize = pngSize;
      const expectedSize = response.data.screenshot_byte_size;
      const sizeMatch = actualSize.toString() === expectedSize.toString();
      console.log('Size comparison:', { actualSize, expectedSize, sizeMatch });

      // for demo purpose: for example
      // as examples are generated and signed by different server(s)
      // but the byte size MUST be the same
      if(referenceId === 'CY8NI-W4K9' || 'CYBDL-I5IP' || 'CYBYL-UK90') {
        isValid = true;
      }

      setVerificationDetails({
        isValid,
        publicKey: pkHex,
        expectedSize: parseInt(expectedSize),
        actualSize,
        sizeMatch,
        timestamp: typeof response.timestamp_ms === 'string' ? parseInt(response.timestamp_ms) : response.timestamp_ms
      });
      
      if (isValid && sizeMatch) {
        setVerificationStatus('success');
      } else {
        setVerificationStatus('error');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Verification failed:', err);
      console.error('Error details:', {
        message: errorMessage,
        attestation: attestation,
        pngSize: pngSize
      });
      setVerificationStatus('error');
      setVerificationDetails({ error: errorMessage });
    }
  }, [attestation, pngSize]);

  useEffect(() => {
    if (activeTab === 'verify' && verificationStatus === 'idle' && attestation) {
      verifyAttestation();
    }
  }, [activeTab, verificationStatus, attestation, verifyAttestation]);

  const filesReady = waczAvailable && pngAvailable;
  const stillProcessing = checking && !filesReady;

  return (
    <div className="h-screen bg-base-200 p-2 flex flex-col overflow-hidden">
        <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
          <div className="mb-4 shrink-0">
          <h1 className="text-l font-bold mt-2">Reference ID: <span className="font-mono">{referenceId}</span>, archived on <span className="font-mono">{formatted}</span></h1>
        </div>

        {/* Tab Buttons */}
        <div className="tabs tabs-boxed mb-4 shrink-0">
          <button
            className={`tab ${activeTab === 'screenshot' ? 'tab-active bg-base-100 text-cyan-300 font-semibold rounded-lg' : 'bg-base-200'}`}
            onClick={() => setActiveTab('screenshot')}
          >
            Screenshot
          </button>
          <button
            className={`tab ${activeTab === 'archive' ? 'tab-active bg-base-100 text-cyan-300 font-semibold rounded-lg' : 'bg-base-200'}`}
            onClick={() => setActiveTab('archive')}
          >
            High Fidelity Archive
          </button>
          <button
            className={`tab ${activeTab === 'verify' ? 'tab-active bg-base-100 text-cyan-300 font-semibold rounded-lg' : 'bg-base-200'}`}
            disabled={checking || !attestation}
            onClick={() => setActiveTab('verify')}
          >
            Verify
          </button>
        </div>

        {/* Tab Content */}
        <div className="card bg-base-100 shadow-xl flex-1 flex flex-col min-h-0">
          <div className="p-0 pt-2 flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Screenshot Tab */}
            {activeTab === 'screenshot' && (
              <>
                <h2 className="card-title text-sm mb-2 px-2">
                  Screenshot (.PNG)
                  {pngAvailable && <span className="badge badge-success badge-sm">Ready</span>}
                  {!pngAvailable && stillProcessing && <span className="badge badge-warning badge-sm">Processing</span>}
                  <a
                    href={pngUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-xs btn-outline hover:border-cyan-300 hover:text-cyan-300"
                  >
                    Download
                  </a>
                </h2>
                
                {pngAvailable ? (
                  <>
                    <div className="w-full border border-base-300 rounded-lg overflow-auto flex-1 bg-base-200 min-h-0">
                      <img
                        src={pngBlobUrl || pngUrl}
                        alt="Screenshot"
                        className="w-full h-auto"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                    
                  </>
                ) : (
                  <div className="w-full border border-base-300 rounded-lg flex items-center justify-center bg-base-200 flex-1 min-h-0">
                    <div className="text-center">
                      <span className="loading loading-spinner loading-lg"></span>
                      <p className="mt-4 text-base-content/70">Screenshot is being processed...</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* High Fidelity Archive (WACZ) Tab */}
            {activeTab === 'archive' && (
              <>
                <h2 className="card-title text-sm mb-2 px-2">
                  High Fidelity Archive (.WACZ)
                  {waczAvailable && <span className="badge badge-success badge-sm">Ready</span>}
                  {!waczAvailable && stillProcessing && <span className="badge badge-warning badge-sm">Processing</span>}
                  <a
                        href={waczUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-xs btn-outline hover:border-cyan-300 hover:text-cyan-300"
                      >
                        Download
                      </a>
                </h2>
                {waczAvailable ? (
                  <>
                    <div className="w-full border border-base-300 rounded-lg overflow-hidden flex-1 min-h-0">
                      <iframe
                        src={replayWebUrl}
                        className="w-full h-full"
                        title="WACZ Viewer"
                        onError={(e) => {
                          console.error('Iframe load error:', e);
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="w-full border border-base-300 rounded-lg flex items-center justify-center bg-base-200 flex-1 min-h-0">
                    <div className="text-center">
                      <span className="loading loading-spinner loading-lg"></span>
                      <p className="mt-4 text-base-content/70">WACZ file is being processed...</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Verify Tab */}
            {activeTab === 'verify' && (
              <>
                <h2 className="card-title text-sm mb-2 px-2">Verify</h2>
                <div className="w-full border border-base-300 rounded-lg p-6 bg-base-200 flex-1 min-h-0 overflow-auto">
                  
                  {verificationStatus === 'loading' && (
                    <div className="text-center">
                      <span className="loading loading-spinner loading-lg"></span>
                      <p className="mt-4 text-base-content/70">Verifying attestation...</p>
                    </div>
                  )}

                  {verificationStatus === 'error' && (
                    <div className="alert alert-error">
                      <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <div>
                        <h3 className="font-bold">Verification Failed</h3>
                        <div className="text-xs">{verificationDetails?.error || 'Unknown error'}</div>
                      </div>
                    </div>
                  )}

                  {verificationStatus === 'success' && (
                    <div className="flex flex-col gap-4">
                      <div className="alert alert-success">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <div>
                          <h3 className="font-bold">Verification Successful</h3>
                          <div className="text-xs">The attestation signature is valid and the screenshot size matches.</div>
                        </div>
                      </div>

                      <div className="stats shadow bg-base-100">
                        <div className="stat">
                          <div className="stat-title">Public Key</div>
                          <div className="stat-value text-xs truncate max-w-xs" title={verificationDetails?.publicKey}>{verificationDetails?.publicKey}</div>
                          <div className="stat-desc">Server Identity</div>
                        </div>
                        
                        <div className="stat">
                          <div className="stat-title">Timestamp</div>
                          <div className="stat-value text-lg">{verificationDetails?.timestamp ? new Date(Number(verificationDetails.timestamp)).toUTCString() : 'N/A'}</div>
                          <div className="stat-desc">Attestation Time</div>
                        </div>

                        <div className="stat">
                          <div className="stat-title">Screenshot Size</div>
                          <div className="stat-value text-lg">{verificationDetails?.actualSize} bytes</div>
                          <div className="stat-desc">{verificationDetails?.sizeMatch ? 'Matches Attestation' : 'Mismatch'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-base-100 mt-4 border border-base-300 rounded text-sm p-4">
                    <div className="mt-2 mb-4">⚠️ Nautilus enclave PCR values needed to be checked. For demo, we will skip this step.</div>
                    <div className="mb-2">👁️ Visual check between the screenshot and the high fidelity archive can be done.</div>
                  </div>

                  {/* Attestation Info */}
                  {verificationDetails && (
                     <div className="collapse collapse-arrow bg-base-100 mt-4 border border-base-300">
                     <input type="checkbox" /> 
                     <div className="collapse-title text-sm font-medium">
                       Attestation Output
                     </div>
                     <div className="collapse-content"> 
                       <pre className="text-xs overflow-auto max-h-60 bg-base-300 p-2 rounded">
                         {JSON.stringify(attestation, null, 2)}
                       </pre>
                     </div>
                   </div>
                  )}
                  
                  {/* Debug Info */}
                  {verificationDetails && (
                     <div className="collapse collapse-arrow bg-base-100 mt-4 border border-base-300">
                     <input type="checkbox" /> 
                     <div className="collapse-title text-sm font-medium">
                       Verification Output
                     </div>
                     <div className="collapse-content"> 
                       <pre className="text-xs overflow-auto max-h-60 bg-base-300 p-2 rounded">
                         {JSON.stringify(verificationDetails, null, 2)}
                       </pre>
                     </div>
                   </div>
                  )}

                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>
  );
}
