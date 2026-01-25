class NewsViewer {
    constructor() {
        this.datePicker = document.getElementById('datePicker');
        this.prevBtn = document.getElementById('prevDay');
        this.nextBtn = document.getElementById('nextDay');
        this.content = document.getElementById('content');
        
        this.currentDate = new Date();
        this.init();
    }

    init() {
        this.datePicker.valueAsDate = this.currentDate;
        this.datePicker.addEventListener('change', () => this.loadNews());
        this.prevBtn.addEventListener('click', () => this.changeDate(-1));
        this.nextBtn.addEventListener('click', () => this.changeDate(1));
        
        this.loadNews();
    }

    changeDate(days) {
        const newDate = new Date(this.datePicker.valueAsDate);
        newDate.setDate(newDate.getDate() + days);
        this.datePicker.valueAsDate = newDate;
        this.loadNews();
    }

    async loadNews() {
        const date = this.datePicker.value;
        const filename = `daily_hot_${date}.md`;
        
        this.content.innerHTML = '<div class="loading">Loading...</div>';
        
        try {
            const response = await fetch(`archives/${filename}`);
            if (!response.ok) {
                throw new Error('File not found');
            }
            
            const markdown = await response.text();
            this.content.innerHTML = marked.parse(markdown);
        } catch (error) {
            this.content.innerHTML = `<div class="error">No data for ${date}</div>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NewsViewer();
});
