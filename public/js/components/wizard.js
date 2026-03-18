/* ================================================================
   wizard.js — Reusable Step Wizard Component
   Usage:
     var wizard = new Wizard('container-id', {
       steps: [
         { id: 'category',   label: 'Category',   icon: '🏷️' },
         { id: 'attributes', label: 'Attributes', icon: '⚙️' },
         { id: 'products',   label: 'Products',   icon: '📦' }
       ],
       onStepChange: function(from, to) { ... }
     });
     wizard.render();
     wizard.goTo('attributes');
================================================================ */

function Wizard(containerId, options) {
  this.containerId = containerId;
  this.options     = Object.assign({
    steps:        [],
    onStepChange: null,
    allowSkip:    false
  }, options);

  this._currentStep = options.steps.length ? options.steps[0].id : null;
  this._completed   = {};
  this._uid         = 'wz_' + Math.random().toString(36).substr(2, 6);

  // Register globally
  if (!window.__WZ) window.__WZ = {};
  window.__WZ[this._uid] = this;
}

// ── Render wizard shell ────────────────────────────────────
Wizard.prototype.render = function() {
  var container = document.getElementById(this.containerId);
  if (!container) return;

  var uid   = this._uid;
  var steps = this.options.steps;
  var self  = this;

  // Step indicator
  var indicator = '<div class="wizard-steps" id="' + uid + '_steps">' +
    steps.map(function(step, i) {
      var isCurrent   = step.id === self._currentStep;
      var isCompleted = !!self._completed[step.id];
      var cls = 'wizard-step' +
        (isCurrent   ? ' current'   : '') +
        (isCompleted ? ' completed' : '');

      return '<div class="' + cls + '" id="' + uid + '_step_' + step.id + '" ' +
        'onclick="window.__WZ[\'' + uid + '\']._onStepClick(\'' + step.id + '\')">' +
        '<div class="wizard-step-num">' +
          (isCompleted ? '✓' : (i + 1)) +
        '</div>' +
        '<div class="wizard-step-label">' + step.label + '</div>' +
        (i < steps.length - 1 ? '<div class="wizard-step-line"></div>' : '') +
        '</div>';
    }).join('') +
    '</div>';

  // Content area
  var content = '<div class="wizard-content" id="' + uid + '_content"></div>';

  // Navigation
  var nav = '<div class="wizard-nav" id="' + uid + '_nav">' +
    '<button class="btn btn-outline" id="' + uid + '_prev" ' +
      'onclick="window.__WZ[\'' + uid + '\'].prev()" style="display:none">← Back</button>' +
    '<div style="flex:1"></div>' +
    '<button class="btn btn-primary" id="' + uid + '_next" ' +
      'onclick="window.__WZ[\'' + uid + '\'].next()">Continue →</button>' +
    '</div>';

  container.innerHTML = indicator + content + nav;
  this._updateIndicator();
  this._updateNav();
};

// ── Navigation ─────────────────────────────────────────────
Wizard.prototype.next = function() {
  var steps = this.options.steps;
  var idx   = steps.findIndex(function(s) { return s.id === this._currentStep; }.bind(this));
  if (idx < steps.length - 1) {
    this._completed[this._currentStep] = true;
    this.goTo(steps[idx + 1].id);
  }
};

Wizard.prototype.prev = function() {
  var steps = this.options.steps;
  var idx   = steps.findIndex(function(s) { return s.id === this._currentStep; }.bind(this));
  if (idx > 0) this.goTo(steps[idx - 1].id);
};

Wizard.prototype.goTo = function(stepId) {
  var from = this._currentStep;
  this._currentStep = stepId;
  this._updateIndicator();
  this._updateNav();
  if (this.options.onStepChange) {
    this.options.onStepChange(from, stepId);
  }
};

Wizard.prototype.markComplete = function(stepId) {
  this._completed[stepId] = true;
  this._updateIndicator();
};

Wizard.prototype.currentStep = function() {
  return this._currentStep;
};

Wizard.prototype.isFirstStep = function() {
  return this.options.steps[0] &&
    this.options.steps[0].id === this._currentStep;
};

Wizard.prototype.isLastStep = function() {
  var steps = this.options.steps;
  return steps[steps.length - 1] &&
    steps[steps.length - 1].id === this._currentStep;
};

// ── Update UI ──────────────────────────────────────────────
Wizard.prototype._updateIndicator = function() {
  var uid   = this._uid;
  var steps = this.options.steps;
  var self  = this;

  steps.forEach(function(step, i) {
    var el = document.getElementById(uid + '_step_' + step.id);
    if (!el) return;
    var isCurrent   = step.id === self._currentStep;
    var isCompleted = !!self._completed[step.id];
    el.className = 'wizard-step' +
      (isCurrent   ? ' current'   : '') +
      (isCompleted ? ' completed' : '');
    var num = el.querySelector('.wizard-step-num');
    if (num) num.textContent = isCompleted ? '✓' : (i + 1);
  });
};

Wizard.prototype._updateNav = function() {
  var uid  = this._uid;
  var prev = document.getElementById(uid + '_prev');
  var next = document.getElementById(uid + '_next');
  if (prev) prev.style.display = this.isFirstStep() ? 'none' : 'inline-flex';
  if (next) next.textContent   = this.isLastStep()  ? 'Save Products' : 'Continue →';
};

Wizard.prototype._onStepClick = function(stepId) {
  // Only allow clicking completed steps or current step
  if (this._completed[stepId] || stepId === this._currentStep) {
    this.goTo(stepId);
  }
};

// ── Set content for current step ───────────────────────────
Wizard.prototype.setContent = function(html) {
  var el = document.getElementById(this._uid + '_content');
  if (el) el.innerHTML = html;
};

// ── CSS for wizard ─────────────────────────────────────────
Wizard.injectStyles = function() {
  if (document.getElementById('wizard-styles')) return;
  var style = document.createElement('style');
  style.id  = 'wizard-styles';
  style.textContent = `
    .wizard-steps {
      display: flex;
      align-items: center;
      padding: 20px 24px;
      background: #fff;
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-lg);
      margin-bottom: 16px;
    }
    .wizard-step {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: default;
      opacity: 0.45;
      flex-shrink: 0;
    }
    .wizard-step.current,
    .wizard-step.completed { opacity: 1; }
    .wizard-step.completed { cursor: pointer; }
    .wizard-step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--slate-200);
      color: var(--slate-500);
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .wizard-step.current   .wizard-step-num { background: var(--color-primary); color: #fff; }
    .wizard-step.completed .wizard-step-num { background: var(--green-500);     color: #fff; }
    .wizard-step-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--slate-500);
      white-space: nowrap;
    }
    .wizard-step.current   .wizard-step-label { color: var(--color-primary); }
    .wizard-step.completed .wizard-step-label { color: var(--green-600); }
    .wizard-step-line {
      flex: 1;
      height: 2px;
      background: var(--slate-200);
      margin: 0 12px;
      min-width: 24px;
    }
    .wizard-content {
      min-height: 300px;
    }
    .wizard-nav {
      display: flex;
      align-items: center;
      padding: 16px 0;
      border-top: 1px solid var(--slate-100);
      margin-top: 16px;
      gap: 12px;
    }
  `;
  document.head.appendChild(style);
};
