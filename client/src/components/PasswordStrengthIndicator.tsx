import {
  CheckCircle,
  XCircle,
} from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  const checks = {
    length: password.length >= 10,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),

    // Cualquier carácter que no sea una letra
    // o un número se considera especial.
    special: /[^A-Za-z0-9]/.test(password),
  };

  const strength =
    Object.values(checks).filter(Boolean).length;

  const strengthPercentage =
    (strength / 5) * 100;

  const getStrengthColor = () => {
    if (strength <= 2) {
      return "bg-red-500";
    }

    if (strength <= 3) {
      return "bg-yellow-500";
    }

    if (strength <= 4) {
      return "bg-blue-500";
    }

    return "bg-green-500";
  };

  const getStrengthLabel = () => {
    if (strength <= 2) {
      return "Débil";
    }

    if (strength <= 3) {
      return "Regular";
    }

    if (strength <= 4) {
      return "Fuerte";
    }

    return "Muy fuerte";
  };

  if (!password) {
    return null;
  }

  return (
    <div className="space-y-3 mt-2">

      {/* ======================================================
          BARRA DE FORTALEZA
          ====================================================== */}

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-gray-600">
            Fortaleza de contraseña
          </span>

          <span className="text-xs font-semibold text-gray-600">
            {getStrengthLabel()}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${getStrengthColor()}`}
            style={{
              width: `${strengthPercentage}%`,
            }}
          />
        </div>
      </div>

      {/* ======================================================
          REQUISITOS
          ====================================================== */}

      <div className="space-y-2">

        {/* LONGITUD */}
        <div className="flex gap-2 items-center">
          {checks.length ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
          )}

          <span className="text-xs text-gray-600">
            Mínimo 10 caracteres
          </span>
        </div>

        {/* MAYÚSCULA */}
        <div className="flex gap-2 items-center">
          {checks.uppercase ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
          )}

          <span className="text-xs text-gray-600">
            Al menos una mayúscula
          </span>
        </div>

        {/* MINÚSCULA */}
        <div className="flex gap-2 items-center">
          {checks.lowercase ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
          )}

          <span className="text-xs text-gray-600">
            Al menos una minúscula
          </span>
        </div>

        {/* NÚMERO */}
        <div className="flex gap-2 items-center">
          {checks.number ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
          )}

          <span className="text-xs text-gray-600">
            Al menos un número
          </span>
        </div>

        {/* CARÁCTER ESPECIAL */}
        <div className="flex gap-2 items-center">
          {checks.special ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
          )}

          <span className="text-xs text-gray-600">
            Al menos un carácter especial
          </span>
        </div>

      </div>
    </div>
  );
}