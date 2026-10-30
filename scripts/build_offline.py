from pathlib import Path
import base64,re
s=Path('dist/index.html').read_text()
s=re.sub(r'<link\s+rel="stylesheet"\s+href="style.css"\s*/?>',lambda m:'<style>'+Path('dist/style.css').read_text()+'</style>',s)
s=re.sub(r'<script\s+src="[^"]+\.js"\s+defer\s*>\s*</script\s*>','',s)
s=s.replace('src="upi-logo.svg"','src="data:image/svg+xml;base64,'+base64.b64encode(Path('dist/upi-logo.svg').read_bytes()).decode()+'"')
s=s.replace('src="npci-logo.svg"','src="data:image/svg+xml;base64,'+base64.b64encode(Path('dist/npci-logo.svg').read_bytes()).decode()+'"')
app_code=Path('dist/app.js').read_text()
for route,fn in {'overview':'renderOverview()', 'transactions':'renderTransactions()', 'alerts':'renderCases()', 'network':'renderNetwork()', 'cases':'renderCases()', 'performance':'renderPerformance()', 'simulator':'window.renderAutoProtection()'}.items():
    app_code=app_code.replace("window.renderCommandCenter('"+route+"')",fn)
app_code=app_code.replace('window.renderSharedModelAnalytics()','renderModel()')
app_code=re.sub(r"if\s*\(\s*!\s*\[\s*'overview'[\s\S]*?\]\.includes\(view\)\s*\)\s*bindView\(\);?",'bindView();',app_code)
for asset in Path('dist/bank-logos').glob('*'):
    mime={'svg':'image/svg+xml','png':'image/png','jpg':'image/jpeg','webp':'image/webp'}[asset.suffix[1:]]
    app_code=app_code.replace('bank-logos/'+asset.name,'data:'+mime+';base64,'+base64.b64encode(asset.read_bytes()).decode())
s=s.replace('</body>', '<script>window.SHIELD_MODEL='+Path('dist/model.json').read_text()+';window.SHIELD_INTELLIGENCE_MODEL='+Path('dist/intelligence-model.json').read_text()+';</script><script>'+Path('dist/payment-bridge.js').read_text()+'</script><script>'+Path('dist/payment-cloud.js').read_text()+'</script><script>'+Path('dist/engine.js').read_text()+'</script><script>'+Path('dist/pipeline.js').read_text()+'</script><script>'+Path('dist/intelligence.js').read_text()+'</script><script>'+Path('dist/intelligence-ui.js').read_text()+'</script><script>'+Path('dist/protection.js').read_text()+'</script><script>'+Path('dist/protection-ui.js').read_text()+'</script><script>'+app_code+'</script></body>')
s=s.replace('<a class="btn" style="text-decoration:none" href="./upi-shield-offline.html" download>Download offline app</a>','<span class="tag">Offline copy</span>')
Path('dist/upi-shield-offline.html').write_text(s)
Path('public/upi-shield-offline.html').write_text(s)
print('Offline app generated: '+str(len(s))+' bytes')
