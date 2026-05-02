export const dashboardHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة تتبع الوقت والإنتاجية</title>
    <!-- Google Fonts: Cairo for beautiful Arabic typography -->
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent-color: #3b82f6;
            --success-color: #10b981;
            --glass-border: rgba(255, 255, 255, 0.1);
        }

        body {
            font-family: 'Cairo', sans-serif;
            background: radial-gradient(circle at top right, #1e293b, var(--bg-color));
            color: var(--text-main);
            margin: 0;
            padding: 2rem;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 3rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--glass-border);
            flex-wrap: wrap;
            gap: 1rem;
        }

        h1 {
            margin: 0;
            font-size: 2.5rem;
            background: linear-gradient(to right, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .status-badge {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success-color);
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            border: 1px solid rgba(16, 185, 129, 0.2);
            box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
        }

        .status-indicator {
            width: 10px;
            height: 10px;
            background-color: var(--success-color);
            border-radius: 50%;
            box-shadow: 0 0 10px var(--success-color);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }

        @media (max-width: 768px) {
            .grid { grid-template-columns: 1fr; }
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.3);
        }

        .card h2 {
            margin-top: 0;
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            color: #e2e8f0;
            border-bottom: 1px dashed rgba(255,255,255,0.1);
            padding-bottom: 0.5rem;
        }

        /* Table Styles */
        .table-container {
            overflow-x: auto;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 1rem;
            text-align: right;
            border-bottom: 1px solid var(--glass-border);
        }

        th {
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.875rem;
        }

        tbody tr {
            transition: background-color 0.2s;
        }

        tbody tr:hover {
            background-color: rgba(255, 255, 255, 0.05);
        }

        .badge {
            background: rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            padding: 0.4rem 0.8rem;
            border-radius: 12px;
            font-size: 0.875rem;
            border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .loading {
            text-align: center;
            padding: 2rem;
            color: var(--text-muted);
            font-style: italic;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
            width: 100%;
            display: flex;
            justify-content: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>لوحة الإنتاجية</h1>
            <div class="status-badge">
                <div class="status-indicator"></div>
                حالة البوت: نشط والتطبيق متصل 🟢
            </div>
        </header>

        <div class="grid">
            <!-- Chart Section -->
            <div class="card">
                <h2>تحليلات الوقت والإنتاجية</h2>
                <div class="chart-container">
                    <canvas id="activityChart"></canvas>
                </div>
            </div>

            <!-- Table Section -->
            <div class="card">
                <h2>سجل الأنشطة الأخيرة</h2>
                <div class="table-container">
                    <table id="logsTable">
                        <thead>
                            <tr>
                                <th>التوقيت</th>
                                <th>النشاط</th>
                                <th>المدة (ساعات)</th>
                            </tr>
                        </thead>
                        <tbody id="logsBody">
                            <tr><td colspan="3" class="loading">جاري تحميل البيانات...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function loadData() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                renderTable(logs);
                renderChart(logs);
            } catch (error) {
                console.error('Error fetching logs:', error);
                document.getElementById('logsBody').innerHTML = '<tr><td colspan="3" style="text-align:center;color:#ef4444;">حدث خطأ في تحميل البيانات. يرجى التحقق من إعدادات Supabase.</td></tr>';
            }
        }

        function renderTable(logs) {
            const tbody = document.getElementById('logsBody');
            tbody.innerHTML = '';

            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="loading">لا توجد أنشطة مسجلة بعد</td></tr>';
                return;
            }

            logs.forEach(log => {
                const date = new Date(log.created_at).toLocaleString('ar-EG', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                
                const tr = document.createElement('tr');
                tr.innerHTML = \`
                    <td dir="ltr" style="text-align:right; color: #cbd5e1;">\${date}</td>
                    <td><span class="badge">\${log.activity}</span></td>
                    <td style="font-weight:bold; color: #10b981;">\${log.duration_hours}</td>
                \`;
                tbody.appendChild(tr);
            });
        }

        function renderChart(logs) {
            if (!logs || logs.length === 0) return;
            
            const activityTotals = {};
            logs.forEach(log => {
                activityTotals[log.activity] = (activityTotals[log.activity] || 0) + log.duration_hours;
            });

            const labels = Object.keys(activityTotals);
            const data = Object.values(activityTotals);

            const ctx = document.getElementById('activityChart').getContext('2d');
            
            Chart.defaults.color = '#94a3b8';
            Chart.defaults.font.family = 'Cairo';

            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'عدد الساعات',
                        data: data,
                        backgroundColor: [
                            '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'
                        ],
                        borderWidth: 0,
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                font: { size: 14, family: 'Cairo' },
                                color: '#e2e8f0',
                                padding: 20
                            }
                        },
                        tooltip: {
                            bodyFont: { family: 'Cairo', size: 14 },
                            titleFont: { family: 'Cairo', size: 16 }
                        }
                    },
                    cutout: '70%'
                }
            });
        }

        // Initialize
        loadData();
    </script>
</body>
</html>
`;
