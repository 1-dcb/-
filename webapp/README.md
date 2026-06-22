# Argos Translate Local Studio

This folder adds a local Flask web interface for the Argos Translate source tree.
The main screen contains a normal translation module and a Transformer Lens
module that visualizes token embeddings, Q/K/V projection, attention weights,
context vectors, and decoder output for short inputs.

## Run

```powershell
.\run_webapp.bat
```

Open:

```text
http://127.0.0.1:5055
```

The UI starts even when language model packages are not installed. In that case
it uses demo mode and reports the missing runtime detail in the setup panel.

Argos runtime data is stored inside this project at:

```text
.argos-local/
```

## Enable Real Offline Translation

Install the runtime dependencies and at least one Argos model package:

```powershell
python -m pip install -e .
python .\webapp\install_model.py en zh
python .\webapp\install_model.py zh en
```

Then restart the Flask app. The status pill should change from demo mode to
offline ready when Argos can load installed language packages.
