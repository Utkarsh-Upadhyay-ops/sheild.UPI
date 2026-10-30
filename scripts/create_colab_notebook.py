"""Generate the portable Colab model lab without a notebook-library dependency."""
import json
import textwrap
from pathlib import Path

cells = []
def md(source):
    cells.append({'cell_type': 'markdown', 'metadata': {}, 'source': textwrap.dedent(source).strip() + '\n'})
def code(source):
    cells.append({'cell_type': 'code', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': textwrap.dedent(source).strip() + '\n'})

md('''
# UPI Shield: Model Lab
Train, evaluate and run the existing project's models in Google Colab.

**Start:** choose **Runtime → Run all**, then upload `upi-shield-vercel.zip` when asked.
A CPU runtime is sufficient. No database, bank login or payment credentials are needed.

This notebook uses the actual project training scripts and assessment engine. It includes the calibrated Random Forest, original graph network, Isolation Forest and temporal graph network. All accounts, payments and fraud labels are synthetic. Results do not establish real bank accuracy.

Training changes only the uploaded copy in this runtime. It does not change the live website. Download your results before the runtime is disconnected.
''')
md('''
## 1. Prepare the Python runtime
Install the required Python libraries. If Colab asks you to restart after installation, restart the session and run the notebook again.
''')
code('''
import os, sys, subprocess, json, shutil, tempfile, zipfile, stat, hashlib, platform
from pathlib import Path

IN_COLAB = 'google.colab' in sys.modules or bool(os.environ.get('COLAB_RELEASE_TAG'))
if os.environ.get('SHIELD_NOTEBOOK_SKIP_INSTALL') != '1':
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
                    'numpy>=1.26,<3', 'scikit-learn==1.8.0',
                    'matplotlib>=3.8,<4', 'networkx>=3.2,<4', 'ipywidgets>=8,<9'], check=True)
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import numpy as np
import sklearn
import matplotlib.pyplot as plt
import networkx as nx
import ipywidgets as widgets
from IPython.display import display, Markdown
print('Python:', platform.python_version())
print('NumPy:', np.__version__, '| scikit-learn:', sklearn.__version__)
''')
md('''
## 2. Prepare Node.js
The temporal model uses the same JavaScript graph features as the website. An existing Node.js 18+ runtime is reused. If needed, the cell downloads an official Node.js LTS binary and checks its published SHA-256 checksum before extraction.
''')
code('''
import urllib.request, tarfile

def prepare_node():
    current = shutil.which('node')
    if current:
        version = subprocess.check_output([current, '--version'], text=True).strip()
        if int(version.lstrip('v').split('.')[0]) >= 18:
            return current
    architecture = {'x86_64': 'x64', 'aarch64': 'arm64'}.get(platform.machine())
    if platform.system() != 'Linux' or architecture is None:
        raise RuntimeError('Install Node.js 18 or newer, then rerun this cell.')
    releases = json.load(urllib.request.urlopen('https://nodejs.org/dist/index.json'))
    release = next(item['version'] for item in releases if item.get('lts'))
    filename = f'node-{release}-linux-{architecture}.tar.xz'
    base = f'https://nodejs.org/dist/{release}/'
    checksums = urllib.request.urlopen(base + 'SHASUMS256.txt').read().decode()
    expected = next(line.split()[0] for line in checksums.splitlines()
                    if line.split()[-1].lstrip('*') == filename)
    destination = Path(tempfile.mkdtemp(prefix='shield-node-'))
    archive = destination / filename
    urllib.request.urlretrieve(base + filename, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise RuntimeError('Node.js checksum mismatch. Installation stopped.')
    with tarfile.open(archive) as handle:
        handle.extractall(destination, filter='data')
    binary = destination / filename.removesuffix('.tar.xz') / 'bin' / 'node'
    os.environ['PATH'] = str(binary.parent) + os.pathsep + os.environ.get('PATH', '')
    return str(binary)

NODE = prepare_node()
print('Node.js:', subprocess.check_output([NODE, '--version'], text=True).strip())
''')
md('''
## 3. Upload the project ZIP
Upload the project source ZIP, not the notebook file. Extraction checks prevent paths outside the workspace. A fresh directory is used each time this cell runs.
''')
code('''
local_archive = os.environ.get('SHIELD_PROJECT_ZIP')
if local_archive:
    project_archive = Path(local_archive).resolve()
else:
    from google.colab import files
    IN_COLAB = True
    uploaded = files.upload()
    archives = [name for name in uploaded if name.lower().endswith('.zip')]
    if len(archives) != 1:
        raise ValueError('Upload exactly one UPI Shield project ZIP.')
    project_archive = Path(archives[0]).resolve()

LAB_ROOT = Path(tempfile.mkdtemp(prefix='upi-shield-lab-'))
with zipfile.ZipFile(project_archive) as handle:
    entries = handle.infolist()
    if len(entries) > 10000 or sum(item.file_size for item in entries) > 100 * 1024 * 1024:
        raise ValueError('The source ZIP is too large. Exclude node_modules and runtime data.')
    for item in entries:
        target = (LAB_ROOT / item.filename).resolve()
        if not target.is_relative_to(LAB_ROOT.resolve()) or stat.S_ISLNK(item.external_attr >> 16):
            raise ValueError('Unsafe archive entry: ' + item.filename)
    handle.extractall(LAB_ROOT)
roots = [path.parents[1] for path in LAB_ROOT.rglob('scripts/train_model.py')]
if len(roots) != 1:
    raise ValueError('Could not identify one UPI Shield source project in the ZIP.')
PROJECT = roots[0]
subprocess.run([NODE, 'scripts/build.mjs'], cwd=PROJECT, check=True)
BACKUP = LAB_ROOT / 'original-models'
shutil.copytree(PROJECT / 'models', BACKUP)
print('Project loaded. Original model files were backed up inside this runtime.')
import csv
corpus_path = PROJECT / 'public/network-transfers.csv'
if corpus_path.exists():
    with corpus_path.open() as handle:
        corpus = list(csv.DictReader(handle))
    corpus_accounts = {row[key] for row in corpus for key in ['sender', 'receiver']}
    print('Separate synthetic exploration corpus:', len(corpus), 'transfers,', len(corpus_accounts), 'accounts')
    print('Graph training below uses independent seeded graph splits, not this exploration CSV.')
''')
md('''
## 4. Train the transaction model
The Random Forest uses separate training, calibration and test splits. Its exported output is calibrated on synthetic data only. The actual evaluation appears below.
''')
code('''
def train(script):
    environment = dict(os.environ, OPENBLAS_NUM_THREADS='1', OMP_NUM_THREADS='1')
    result = subprocess.run([sys.executable, script], cwd=PROJECT, env=environment,
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr + '\\n' + result.stdout)
    print(result.stdout)
    if result.stderr.strip():
        print(result.stderr)

train('scripts/train_model.py')
rf = json.loads((PROJECT / 'models/random-forest.json').read_text())
fig, axis = plt.subplots(figsize=(9, 4))
axis.barh(rf['features'], rf['metadata']['feature_importance'], color='#168a66')
axis.set_title('Random Forest feature importance')
axis.set_xlabel('Relative importance, not a causal explanation')
fig.tight_layout()
plt.show()
''')
md('''
## 5. Train the original graph and anomaly models
This reproduces the existing mean-aggregation graph network and Isolation Forest. These models remain separate from the newer temporal graph layer.
''')
code('''
train('scripts/train_intelligence.py')
train('scripts/train_anomaly.py')
original_graph = json.loads((PROJECT / 'models/graph-and-anomaly.json').read_text())
print('Graph precision:', round(original_graph['graph']['precision'], 4))
print('Graph recall:', round(original_graph['graph']['recall'], 4))
print('Isolation Forest trees:', len(original_graph['anomaly']['trees']))
''')
md('''
## 6. Train and evaluate the temporal graph network
The temporal network combines directed neighborhoods with transaction amounts and timing. Its threshold is chosen from validation data. Broad and rare-pattern test results are shown separately, including false positives. This training can take a few minutes on a CPU runtime.
''')
code('''
train('scripts/train_temporal_graph.py')
temporal = json.loads((PROJECT / 'models/temporal-graph.json').read_text())
evaluation = json.loads((PROJECT / 'reports/temporal-graph-evaluation.json').read_text())
print('Temporal model version:', temporal['version'])
print('Graph dataset:', evaluation.get('dataset', {}))
print('Auxiliary verification enabled:', temporal['enabled'])
print('Selected threshold:', temporal['reviewThreshold'])
for label, result in [('Broad test', evaluation['test']),
                      ('Rare-pattern stress test', evaluation['rareTrafficStress']['metrics'])]:
    print(f"{label}: precision {result['precision']:.2%}, recall {result['recall']:.2%}, "
          f"legitimate-account false positive rate {result['falsePositiveRate']:.2%}")
fig, axes = plt.subplots(1, 2, figsize=(10, 4))
for axis, title, result in zip(axes, ['Broad test', 'Rare-pattern stress test'],
                             [evaluation['test'], evaluation['rareTrafficStress']['metrics']]):
    c = result['confusion']
    matrix = np.array([[c['tn'], c['fp']], [c['fn'], c['tp']]])
    axis.imshow(np.log1p(matrix), cmap='Blues')
    for (row, column), count in np.ndenumerate(matrix):
        axis.text(column, row, str(count), ha='center', va='center', color='#10283f',
                  bbox={'facecolor': 'white', 'alpha': .75, 'edgecolor': 'none'})
    axis.set(xticks=[0, 1], yticks=[0, 1], xticklabels=['Normal', 'Review'],
             yticklabels=['Normal', 'Injected fraud'], xlabel='Predicted', ylabel='Synthetic truth', title=title)
fig.tight_layout()
plt.show()
print(evaluation['limitations'])
''')
md('''
## 7. Check Python and website inference parity
These tests compare exported models with their JavaScript inference results. No bank or hosted website is contacted. A passing test is not proof of real-world accuracy or network latency.
''')
code('''
for test in ['tests/engine.test.cjs', 'tests/temporal-graph.test.cjs', 'tests/intelligence.test.mjs', 'tests/anomaly.test.cjs']:
    result = subprocess.run([NODE, test], cwd=PROJECT, capture_output=True, text=True)
    print(result.stdout)
    if result.returncode:
        raise RuntimeError(result.stderr or 'Model check failed: ' + test)
print('All four model test suites passed.')
''')
md('''
## 8. Try a payment through the actual assessment engine
Choose a scenario and press **Assess payment**. The engine uses the trained files from this notebook. Behavioral deviations below are explicitly generated test inputs, not measured biometrics. No PIN is collected.

The displayed model and engine timings describe this Colab process. They are not hosted API or bank-settlement latency measurements.
''')
code('''
from datetime import datetime, timezone, timedelta
import uuid, time

ASSESSOR = """
import handler from './api/assess.mjs';
let input='';for await (const chunk of process.stdin) input+=chunk;
const response=await handler.fetch(new Request('http://colab.local/api/assess',{
method:'POST',headers:{'Content-Type':'application/json'},body:input}));
if(!response.ok)throw Error(await response.text());
console.log(JSON.stringify(await response.json()));
"""

def assessment_body(scenario='Everyday payment', amount=250):
    now = datetime.now(timezone.utc)
    sender, receiver = 'colab-customer', 'pay-aanya'
    history = [{'sender': sender, 'receiver': receiver, 'amount': 400 + i * 20,
                'timestamp': (now - timedelta(days=i + 1)).isoformat(), 'settled': True}
               for i in range(12)]
    payment = {'id': 'PAY-colab-' + str(uuid.uuid4()), 'sender': sender, 'receiver': receiver,
               'amount': float(amount), 'timestamp': now.isoformat(),
               'device': 'new' if scenario == 'Unfamiliar device' else 'familiar'}
    def edge(a, b, value=2000, ago=20):
        history.append({'sender': a, 'receiver': b, 'amount': value,
                        'timestamp': (now - timedelta(seconds=ago)).isoformat(), 'settled': True})
    if scenario == 'Mule forwarding':
        for i in range(5): edge('incoming-' + str(i), sender)
    elif scenario == 'Circular transfers':
        edge(receiver, 'cycle-hop'); edge('cycle-hop', sender)
    elif scenario == 'Rapid repeated payments':
        for i in range(25): edge(sender, 'burst-' + str(i), 400, 50 - i)
    behavior = {'available': False}
    if scenario == 'Abnormal interaction':
        behavior = {'available': True, 'deviation': 4}
    return {'demo': True, 'payment': payment, 'history': history, 'behavior': behavior}

def assess_payment(scenario='Everyday payment', amount=250):
    body = assessment_body(scenario, amount)
    started = time.perf_counter()
    process = subprocess.run([NODE, '--input-type=module', '-e', ASSESSOR],
                             cwd=PROJECT, input=json.dumps(body), capture_output=True, text=True)
    if process.returncode:
        raise RuntimeError(process.stderr)
    return body, json.loads(process.stdout), (time.perf_counter() - started) * 1000

normal_body, normal_result, _ = assess_payment()
held_body, held_result, _ = assess_payment('Mule forwarding', 4000)
assert normal_result['decision'] == 'Allow', normal_result['reasons']
assert held_result['decision'] == 'Flag', held_result['reasons']
print('Automatic checks: normal payment allowed; mule forwarding flagged; no settlement performed.')
''')
code('''
def show_assessment(scenario, amount):
    body, result, process_ms = assess_payment(scenario, amount)
    display(Markdown(f"### Decision: **{result['decision']}**"))
    print(f"Random Forest synthetic risk index: {result['modelScore'] * 100:.1f} / 100")
    graph = result['intelligence'].get('temporalGraphModel')
    if graph:
        print(f"Temporal graph sender index: {graph['sender'] * 100:.1f} / 100")
    print(f"Measured model stage: {result['timings']['scoringMs']:.2f} ms")
    print(f"Local Python-to-Node process call: {process_ms:.2f} ms (not API latency)")
    print('Behavior:', 'Generated experimental deviation' if body['behavior']['available'] else 'Behavioral Data Unavailable')
    for reason in result['reasons']:
        print('•', reason)
    recent = [e for e in body['history']
              if (datetime.fromisoformat(body['payment']['timestamp']) - datetime.fromisoformat(e['timestamp'])).total_seconds() <= 120]
    network = nx.DiGraph()
    for edge in recent:
        network.add_edge(edge['sender'], edge['receiver'])
    payment = body['payment']
    network.add_nodes_from([payment['sender'], payment['receiver']])
    network.add_edge(payment['sender'], payment['receiver'])
    positions = nx.spring_layout(network, seed=41)
    scores = {a['id']: a['risk'] for a in (graph or {}).get('accounts', [])}
    threshold = (graph or {}).get('reviewThreshold', 1)
    colors = ['#edaa65' if scores.get(node, 0) >= threshold else '#b5decf' for node in network]
    fig, axis = plt.subplots(figsize=(9, 5))
    nx.draw_networkx_nodes(network, positions, node_color=colors, node_size=1600, ax=axis)
    nx.draw_networkx_labels(network, positions, font_size=8, ax=axis)
    settled_edges = [(e['sender'], e['receiver']) for e in recent]
    nx.draw_networkx_edges(network, positions, edgelist=settled_edges, arrows=True,
                           node_size=1600, edge_color='#579c82', ax=axis)
    nx.draw_networkx_edges(network, positions, edgelist=[(payment['sender'], payment['receiver'])],
                           arrows=True, node_size=1600, style='dashed', edge_color='#d27e34', ax=axis)
    axis.set_title('Solid: settled synthetic history. Dashed: hypothetical candidate payment.')
    axis.axis('off')
    plt.show()
    return result

scenario_control = widgets.Dropdown(options=['Everyday payment', 'Mule forwarding', 'Circular transfers',
    'Rapid repeated payments', 'Unfamiliar device', 'Abnormal interaction'], description='Scenario:')
amount_control = widgets.IntSlider(value=250, min=10, max=20000, step=10,
                                  description='Amount ₹:', continuous_update=False)
assess_button = widgets.Button(description='Assess payment', button_style='success')
assessment_output = widgets.Output()

def on_assess(_):
    assess_button.disabled = True
    try:
        with assessment_output:
            assessment_output.clear_output(wait=True)
            show_assessment(scenario_control.value, amount_control.value)
    finally:
        assess_button.disabled = False

assess_button.on_click(on_assess)
display(widgets.VBox([scenario_control, amount_control, assess_button, assessment_output]))
# Render one real assessment so the notebook also works without widget support.
with assessment_output:
    preview_result = show_assessment('Everyday payment', 250)
''')
md('''
## 9. Download model artifacts
The archive contains canonical `models/`, evaluation `reports/`, and model parity fixtures. It contains no database, sessions or credentials.

In VS Code, back up the original files, extract this archive into your project, then run `npm run build` and `npm test`. Review the actual evaluation before deployment. Downloading this archive does not update Vercel automatically.
''')
code('''
BUNDLE = LAB_ROOT / 'UPI_Shield_Colab_Model_Artifacts.zip'
environment = {'python': platform.python_version(), 'numpy': np.__version__, 'scikit_learn': sklearn.__version__,
               'node': subprocess.check_output([NODE, '--version'], text=True).strip(),
               'scope': 'Trained and evaluated in this notebook runtime; synthetic data only',
               'temporal_model': temporal['version'], 'temporal_verification_enabled': temporal['enabled']}
with zipfile.ZipFile(BUNDLE, 'w', zipfile.ZIP_DEFLATED) as archive:
    for folder in ['models', 'reports']:
        for path in sorted((PROJECT / folder).glob('*.json')):
            archive.write(path, str(path.relative_to(PROJECT)))
    for name in ['parity.json', 'temporal-graph-parity.json', 'anomaly-parity.json']:
        archive.write(PROJECT / 'tests' / name, 'tests/' + name)
    archive.writestr('colab-environment.json', json.dumps(environment, indent=2))
    archive.writestr('IMPORT_INSTRUCTIONS.txt',
        'Back up your project first. Extract models/, reports/ and tests/ into the existing project.\\n'
        'Run npm run build, then npm test. Inspect evaluation results before deployment.\\n'
        'All data and training labels are synthetic. No real money moves.\\n')
print('Artifact archive ready:', BUNDLE.name)
if IN_COLAB and os.environ.get('SHIELD_NOTEBOOK_NO_DOWNLOAD') != '1':
    from google.colab import files
    files.download(str(BUNDLE))
else:
    print('Local artifact path:', BUNDLE)
''')
md('''
## What this notebook does not do
It does not connect to real banks, collect a UPI PIN, operate the shared payment ledger, or provide continuous website hosting. Use the existing backend for the website. Colab is the training and experimentation environment.

Official file upload/download reference: https://colab.research.google.com/notebooks/io.ipynb
''')

for index, cell in enumerate(cells):
    cell['id'] = f'shield-{index:02d}'
notebook = {'cells': cells, 'metadata': {'colab': {'name': 'UPI_Shield_Model_Lab.ipynb'},
    'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'},
    'language_info': {'name': 'python', 'version': '3.12'}}, 'nbformat': 4, 'nbformat_minor': 5}
root = Path(__file__).resolve().parents[1]
(root / 'notebooks').mkdir(exist_ok=True)
(root / 'notebooks/UPI_Shield_Model_Lab.ipynb').write_text(json.dumps(notebook, indent=2) + '\n')
print('Created', len(cells), 'notebook cells.')
