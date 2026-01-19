/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // あなたのデザインのグラデーション色
                'coral': '#FF8A80',
                'peach': '#FFAB91',
                'orange': '#FFB74D',
                'yellow': '#FFD54F',
            },
            fontFamily: {
                'jp': ['Noto Sans JP', 'sans-serif'],
            },
        },
    },
    plugins: [],
}