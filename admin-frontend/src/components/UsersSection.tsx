import React, { useState, useEffect } from 'react';
import { formatNumber } from '../utils/helpers';
import { useUsers } from '../hooks/useUsers';
import { UserModal } from './UserModal';
import CreateUserModal from './CreateUserModal';
import { useUserStats } from '../hooks/useUserStats';

const TableHeader = () => (
  <thead className="bg-gray-50 dark:bg-gray-800">
    <tr>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Email
      </th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Role
      </th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Credits
      </th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Username
      </th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Created
      </th>
    </tr>
  </thead>
);

const UsersSection: React.FC = () => {
  const {
    users = [],
    loading,
    error,
    refresh,
    page,
    totalPages,
    setPage,
    search,
    setSearch,
  } = useUsers();
  const { stats } = useUserStats();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // debounce search input
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput, setSearch]);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
          User Management
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Create, edit, and delete users. Manage token balances and usage.
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-green-100 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">Total Users</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.totalUsers}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-green-100 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">Admins</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.adminUsers}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-green-100 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">Recent (7d)</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.recentUsers}
            </p>
          </div>
        </div>
      )}

      {/* Search & create */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search users..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        />
        <button
          onClick={() => setCreateOpen(true)}
          className="ml-auto px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-md hover:bg-green-600 transition-colors"
        >
          New User
        </button>
      </div>

      {/* Users table */}
      {loading && <p className="text-gray-600 dark:text-gray-400">Loading users...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <TableHeader />
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr
                  key={u._id}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setSelectedId(u._id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {formatNumber(u.tokenCredits)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {u.username ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(u.createdAt as unknown as string).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Prev
          </button>
          {Array.from({ length: totalPages }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setPage(idx + 1)}
              className={`px-3 py-1 border rounded ${
                page === idx + 1
                  ? 'bg-green-500 text-white border-green-500'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {idx + 1}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Next
          </button>
        </div>
      )}

      {/* Modals */}
      {selectedId && (
        <UserModal
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      )}
    </section>
  );
};

export default UsersSection;
