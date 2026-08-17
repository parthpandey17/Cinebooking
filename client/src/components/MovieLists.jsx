import { TrashIcon } from '@heroicons/react/24/solid'

// Fallback shown when movie image URL is broken (e.g. via.placeholder.com is dead)
const posterFallback = (name = 'Movie') =>
	`data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' style='background:%234338ca'><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='18' fill='white'>${encodeURIComponent(name)}</text></svg>`

const posterSrc = (src, name) => (!src || src.includes('via.placeholder.com') ? posterFallback(name) : src)

const MoviePoster = ({ src, name, className }) => (
	<img
		src={posterSrc(src, name)}
		alt={name}
		className={className}
		onError={(e) => {
			e.currentTarget.onerror = null
			e.currentTarget.src = posterFallback(name)
		}}
	/>
)

const MovieLists = ({ movies, search, handleDelete }) => {
	const moviesList = movies?.filter((movie) => movie.name.toLowerCase().includes(search?.toLowerCase() || ''))

	return !!moviesList.length ? (
		<div className="grid grid-cols-1 gap-4 rounded-md bg-gradient-to-br from-indigo-100 to-white p-4 drop-shadow-md lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1920px]:grid-cols-5">
			{moviesList.map((movie, index) => {
				return (
					<div key={index} className="flex min-w-fit flex-grow rounded-md bg-white drop-shadow-md">
						<MoviePoster
							src={movie.img}
							name={movie.name}
							className="h-36 rounded-md object-contain drop-shadow-md sm:h-48"
						/>
						<div className="flex flex-grow flex-col justify-between p-2">
							<div>
								<p className="text-lg font-semibold sm:text-xl">{movie.name}</p>
								<p>length : {movie.length || '-'} min.</p>
							</div>
							<button
								className="flex w-fit items-center gap-1 self-end rounded-md bg-gradient-to-br from-red-700 to-rose-600 py-1 pl-2 pr-1.5 text-sm font-medium text-white hover:from-red-600 hover:to-rose-500"
								onClick={() => handleDelete(movie)}
							>
								DELETE
								<TrashIcon className="h-5 w-5" />
							</button>
						</div>
					</div>
				)
			})}
		</div>
	) : (
		<div>No movies found</div>
	)
}

export default MovieLists
