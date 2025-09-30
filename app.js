// Replace the uploadCsvData function with this version that uploads in chunks

async function uploadCsvData() {
    if (!parsedCsvData || parsedCsvData.length === 0) {
        alert('No data to upload');
        return;
    }
    
    uploadCsvConfirm.disabled = true;
    csvUploadProgress.classList.remove('hidden');
    
    let totalUploaded = 0;
    let totalKeywords = 0;
    
    // Calculate total keywords
    parsedCsvData.forEach(group => {
        totalKeywords += group.keywords.length;
    });
    
    for (const group of parsedCsvData) {
        try {
            // Validate keywords before uploading
            const validKeywords = group.keywords.filter(kw => {
                const isValid = kw.keyword && kw.target_url && kw.search_volume !== undefined;
                if (!isValid) {
                    console.warn('Skipping invalid keyword:', kw);
                }
                return isValid;
            });
            
            if (validKeywords.length === 0) {
                console.error('No valid keywords in group:', group);
                throw new Error('No valid keywords found in this group');
            }
            
            console.log(`Found ${validKeywords.length} valid keywords out of ${group.keywords.length}`);
            
            // Split keywords into chunks of 100
            const chunkSize = 100;
            const chunks = [];
            
            for (let i = 0; i < validKeywords.length; i += chunkSize) {
                chunks.push(validKeywords.slice(i, i + chunkSize));
            }
            
            console.log(`Uploading ${group.domain} in ${chunks.length} chunk(s)`);
            
            // Upload each chunk
            for (let i = 0; i < chunks.length; i++) {
                csvProgressText.textContent = `Uploading ${group.domain} (${group.country})... Chunk ${i + 1}/${chunks.length}`;
                csvProgressBar.style.width = `${(totalUploaded / totalKeywords) * 100}%`;
                
                console.log('Sending chunk:', chunks[i].slice(0, 2)); // Log first 2 keywords
                
                const res = await fetch('/api/keywords/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: group.domain,
                        country: group.country,
                        keywords: chunks[i]
                    })
                });
                
                const responseText = await res.text();
                
                if (!res.ok) {
                    let errorMessage = 'Failed to upload';
                    try {
                        const errorData = JSON.parse(responseText);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        errorMessage = `Server error (${res.status}). Check console for details.`;
                    }
                    throw new Error(errorMessage);
                }
                
                totalUploaded += chunks[i].length;
                
                // Small delay between chunks to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log(`✓ Successfully uploaded ${validKeywords.length} keywords for ${group.domain}`);
            
        } catch (error) {
            console.error(`Error uploading ${group.domain}:`, error);
            alert(`Error uploading keywords for ${group.domain}: ${error.message}\n\nUploaded ${totalUploaded}/${totalKeywords} keywords before error.`);
            break;
        }
    }
    
    csvProgressBar.style.width = '100%';
    csvProgressText.textContent = `Successfully uploaded ${totalUploaded} keywords!`;
    
    setTimeout(() => {
        closeCsvModalHandler();
        fetchDashboardData();
        csvUploadProgress.classList.add('hidden');
        csvProgressBar.style.width = '0%';
    }, 2000);
}