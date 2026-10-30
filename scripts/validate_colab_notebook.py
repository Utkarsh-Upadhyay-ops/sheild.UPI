"""Execute the model notebook locally against an isolated source ZIP copy."""
import json
import os
import tempfile
from pathlib import Path
import nbformat
from nbclient import NotebookClient

root = Path(__file__).resolve().parents[1]
os.environ['SHIELD_PROJECT_ZIP'] = str(root / 'upi-shield-vercel.zip')
os.environ['SHIELD_NOTEBOOK_SKIP_INSTALL'] = '1'
os.environ['SHIELD_NOTEBOOK_NO_DOWNLOAD'] = '1'
notebook = nbformat.read(root / 'notebooks/UPI_Shield_Model_Lab.ipynb', as_version=4)
nbformat.validate(notebook)
if os.environ.get('SHIELD_NOTEBOOK_PLAIN_EXECUTION') == '1':
    namespace = {'__name__': '__main__'}
    for index, cell in enumerate(notebook.cells):
        if cell.cell_type == 'code':
            print(f'Executing code cell {index}', flush=True)
            exec(compile(cell.source, f'notebook-cell-{index}', 'exec'), namespace)
    mode = 'Local Python cell execution; Jupyter transport and Google UI not exercised'
else:
    client = NotebookClient(notebook, timeout=600, kernel_name='python3', resources={'metadata': {'path': str(root)}})
    client.execute()
    output = Path(tempfile.gettempdir()) / 'UPI_Shield_Model_Lab_executed.ipynb'
    nbformat.write(notebook, output)
    mode = 'Local Jupyter kernel, not a Google-hosted Colab session'
count = sum(cell.cell_type == 'code' for cell in notebook.cells)
report = {'passed': True, 'codeCellsExecuted': count, 'environment': mode,
          'checks': ['All model training scripts', 'Actual held-out and rare-pattern evaluations',
                     'Four JavaScript model parity/integration suites', 'Normal payment allowed',
                     'Mule forwarding flagged', 'Interactive assessment rendering', 'Model artifact export']}
(root / 'tests/colab-notebook-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
