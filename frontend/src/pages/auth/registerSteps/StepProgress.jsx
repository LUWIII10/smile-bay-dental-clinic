function StepProgress({ currentStep, totalSteps }) {
  return (
    <div className="login-step-progress">
      <div className="login-step-progress-track">
        <div className="login-step-progress-fill" style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
      </div>
      <span className="login-step-progress-label">Step {currentStep} of {totalSteps}</span>
    </div>
  );
}

export default StepProgress;
