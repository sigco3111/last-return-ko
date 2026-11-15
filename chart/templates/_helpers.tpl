{{- define "last-return.name" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "last-return.selectorLabels" -}}
app.kubernetes.io/name: last-return
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "last-return.labels" -}}
{{ include "last-return.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}
