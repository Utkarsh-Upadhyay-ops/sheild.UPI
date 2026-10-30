# Google Colab model lab

Open `UPI_Shield_Model_Lab.ipynb` in Google Colab through **File → Upload notebook**, then choose **Runtime → Run all**. Upload the existing `upi-shield-vercel.zip` source package when the notebook asks for a project ZIP. A CPU runtime is sufficient.

The notebook trains the project's Random Forest, original graph network, Isolation Forest and temporal graph network using the actual project scripts. It displays evaluation charts, runs model parity tests, assesses sample payments through the actual engine, and provides an interactive scenario selector with a directed graph.

Training happens in a separate runtime copy. No database or production credentials are needed. Nothing is automatically deployed to the live website. Behavioral signals in the scenario lab are generated inputs, not collected biometric measurements. Model and process times measured in Colab are not complete hosted API latency.

The final cell downloads `UPI_Shield_Colab_Model_Artifacts.zip`. Back up your project before extracting its `models/`, `reports/` and `tests/` folders into the existing project. Run `npm run build` and `npm test`, then review the actual evaluation before deployment. If an auxiliary model's gate fails, its enabled flag remains false.

The source package does not include Python dependencies or node_modules. The notebook installs Python dependencies, reuses Node.js 18+ when available, and otherwise downloads an official Node.js LTS archive after verifying its published checksum. Download results before the Colab runtime is disconnected.

## Local validation

Python dependencies are optional for website development. To execute the notebook locally:

```bash
python -m pip install -r requirements-notebooks.txt
python scripts/validate_colab_notebook.py
```

The validator reads the source ZIP, extracts it to a temporary directory, executes all notebook cells with a local Jupyter kernel, and writes a validation report to `tests/colab-notebook-validation.json`. It does not claim execution on Google's hosted infrastructure. In a restricted environment, set `SHIELD_NOTEBOOK_PLAIN_EXECUTION=1` to execute the same Python cells without a Jupyter network transport. The Google file picker and browser download handoff require a real Colab session.

Regenerate the clean notebook after editing its generator with:

```bash
python scripts/create_colab_notebook.py
```

Official Colab file upload and download reference: https://colab.research.google.com/notebooks/io.ipynb
